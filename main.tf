terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "4.58.0"
    }
  }
}

variable "aws_region" {
  type = string
}

variable "event_source" {
  type = string
}

variable "log_retention_in_days" {
  type    = number
  default = 14
}

provider "aws" {
  region = var.aws_region
}

locals {
  tag = var.event_source
}

module "log_groups" {
  for_each = toset(["dev", "prod"])
  source   = "./infra/log-group"

  environment           = each.key
  event_source          = var.event_source
  log_retention_in_days = var.log_retention_in_days
  tag                   = local.tag
}

module "eventbridge" {
  source = "terraform-aws-modules/eventbridge/aws"

  bus_name = var.event_source

  attach_cloudwatch_policy = true
  cloudwatch_target_arns   = [module.log_groups["dev"].event_log_group_arn, module.log_groups["prod"].event_log_group_arn]

  attach_sqs_policy = true
  sqs_target_arns = [
    aws_sqs_queue.dlq.arn
  ]

  create_connections            = true
  create_api_destinations       = true
  attach_api_destination_policy = true

  tags = {
    Name = local.tag
  }

  rules = {
    dev = {
      description = "dev logs"
      event_pattern = jsonencode({ "source" : [{
        "prefix" : module.log_groups["dev"].event_source_name
      }] })
    }
    prod = {
      description = "prod logs"
      event_pattern = jsonencode({ "source" : [{
        "prefix" : module.log_groups["prod"].event_source_name
      }] })
    }
  }

  targets = {
    dev = [
      {
        name            = "send-logs-to-cloudwatch-dev"
        arn             = module.log_groups["dev"].event_log_group_arn,
        dead_letter_arn = aws_sqs_queue.dlq.arn
      },
      {
        name            = "send-logs-to-test"
        destination     = "test"
        attach_role_arn = true
        dead_letter_arn = aws_sqs_queue.dlq.arn
      }
    ]
    prod = [
      {
        name = "send-logs-to-cloudwatch-prod"
        arn  = module.log_groups["prod"].event_log_group_arn
      }
    ]
  }

  connections = {
    test = {
      authorization_type = "API_KEY"
      auth_parameters = {
        api_key = {
          key   = "x-signature-id"
          value = "foo"
        }
      }
    }
  }

  api_destinations = {
    test = {
      description                      = "test"
      invocation_endpoint              = "https://smee.io/IYwsZW7syiYiv4I"
      http_method                      = "POST"
      invocation_rate_limit_per_second = 20
    }
  }
}

data "aws_iam_policy_document" "eventbridge" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream"
    ]

    resources = [
      "${module.log_groups["dev"].event_log_group_arn}:*",
      "${module.log_groups["prod"].event_log_group_arn}:*"
    ]

    principals {
      type = "Service"
      identifiers = [
        "events.amazonaws.com"
      ]
    }
  }
  statement {
    effect = "Allow"
    actions = [
      "logs:PutLogEvents"
    ]

    resources = [
      "${module.log_groups["dev"].event_log_group_arn}:*:*",
      "${module.log_groups["prod"].event_log_group_arn}:*:*"
    ]

    principals {
      type = "Service"
      identifiers = [
        "events.amazonaws.com"
      ]
    }
  }
}

resource "aws_cloudwatch_log_resource_policy" "eventbridge" {
  policy_document = data.aws_iam_policy_document.eventbridge.json
  policy_name     = "${var.event_source}-resource-policy"
}

resource "aws_iam_user" "events" {
  name = var.event_source
}

resource "aws_iam_access_key" "events" {
  user = aws_iam_user.events.name
}

resource "aws_iam_user_policy" "events" {
  name = "write-events"
  user = aws_iam_user.events.name

  policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Effect" : "Allow",
        "Action" : "events:PutEvents",
        "Resource" : "${module.eventbridge.eventbridge_bus_arn}"
      }
    ]
  })
}

resource "aws_sqs_queue" "dlq" {
  name = "${var.event_source}-dlq"
}

output "aws_region" {
  value = var.aws_region
}

output "event_bus_arn" {
  value = module.eventbridge.eventbridge_bus_arn
}

output "event_access_key" {
  value = aws_iam_access_key.events.id
}

output "event_secret_key" {
  value     = aws_iam_access_key.events.secret
  sensitive = true
}

output "event_source_name_dev" {
  value = module.log_groups["dev"].event_source_name
}

output "event_source_name_prod" {
  value = module.log_groups["prod"].event_source_name
}
