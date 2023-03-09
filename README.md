# PagerDuty - Extract Runbook from Alert

This repository contains a webhook, implemented using [CloudFlare Workers](https://workers.cloudflare.com/), which will extract a runbook value from the triggering alert upon incident creation and store the value in a custom field named `runbook`.

## Installation

1. Ensure that you have a Custom Field set up with the name `runbook`, a Schema created containing that Field and that the Schema is assigned to the relevant Services in your PagerDuty account.
2. Create a read-write PagerDuty [REST API Key](https://support.pagerduty.com/docs/api-access-keys).
3. Create a webhook with the expected URL of the webhook. Make note of the generated secret.
4. Deploy the worker by running `npm run deploy:production`
5. Use wrangler to set these three secrets:

* `PD_API_KEY` - The REST API Key
* `PD_WEBHOOK_SECRET` - The secret for the webhook

For example:
```
$ wrangler secret put PD_API_KEY
```

Once done, `wrangler secret list` should show the following:

```
[
  {
    "name": "PD_API_KEY",
    "type": "secret_text"
  },
  {
    "name": "PD_WEBHOOK_SECRET",
    "type": "secret_text"
  }
]
```