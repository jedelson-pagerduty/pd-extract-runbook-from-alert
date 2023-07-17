/* eslint-disable max-classes-per-file */
import fetchRetry, { RequestInitWithRetry } from "fetch-retry";
import { Environment } from "./environment";

type CustomFieldValue = {
  name: string;
  value: string;
};

export class ErrorWrapper {
  error?: ErrorContent;
}

export class ErrorContent {
  code?: number;

  message?: string;

  errors?: string[];
}

class AlertResponse {
  alerts!: Alert[];
}

export class Alert {
  body?: AlertBody;
}

export class AlertBody {
  details?: AlertDetails;
}

export class AlertDetails {
  body?: string;
}

const RETRY_COUNT_SET = 3;
const RETRY_COUNT_GET_ALERT = 5;
const RETRY_DELAY_SET = 1000;
const RETRY_DELAY_GET_ALERT = 500;

function createUrl(environment: Environment, path: string): string {
  const domain = environment.PD_API_DOMAIN || "api.pagerduty.com";
  return `https://${domain}${path}`;
}

function createInit(
  environment: Environment,
  method: string,
  includeEarlyAccessHeader = false,
): RequestInitWithRetry {
  const headers: Record<string, string> = {
    Accept: "application/vnd.pagerduty+json;version=2",
    "Content-Type": "application/json",
    Authorization: `Token token=${environment.PD_API_KEY}`,
  };

  if (includeEarlyAccessHeader) {
    headers["X-Early-Access"] = "flex-service-early-access";
  }

  return {
    method,
    headers,
  };
}

export async function setCustomFieldValues(
  environment: Environment,
  incidentId: string,
  values: CustomFieldValue[],
): Promise<Response> {
  const init = createInit(environment, "PUT", true);
  init.retries = RETRY_COUNT_SET;
  init.retryDelay = RETRY_DELAY_SET;
  init.retryOn = [500, 429];
  init.body = JSON.stringify({ custom_fields: values });

  return fetchRetry(fetch)(
    createUrl(environment, `/incidents/${incidentId}/custom_fields/values`),
    init,
  );
}

export async function getFirstAlert(
  environment: Environment,
  incidentId: string,
): Promise<Alert | false> {
  const init = createInit(environment, "GET");
  init.retryDelay = RETRY_DELAY_GET_ALERT;

  let alert;

  // sometimes alerts are not fully hydrated immediately after incident creation. This retry logic attempts to ensure that a hydrated alert is used.
  init.retryOn = async function retry(attempt, error, response) {
    if (attempt === RETRY_COUNT_GET_ALERT) {
      console.log(`giving up fetching alert after ${attempt} attempts`);
      return false;
    }

    console.log(
      `Attempt #${attempt + 1}: Request ID: ${response?.headers.get(
        "x-request-id",
      )}`,
    );

    if (
      error ||
      !response ||
      response.status === 500 ||
      response.status === 429
    ) {
      console.log("Retrying due to error");
      return true;
    }

    const responseBody = await response.json<AlertResponse>();
    if (!responseBody.alerts || responseBody.alerts.length === 0) {
      console.log(
        "response body did not not contain alert. Assuming this is correct.",
      );
      return false;
    }

    const [responseAlert] = responseBody.alerts;

    if (!responseAlert.body) {
      console.log("retrying due to alert having no body");
      // console.log(JSON.stringify(responseAlert, null, 2));
      return true;
    }

    console.log("alert with body received");
    // console.log(JSON.stringify(responseAlert.body, null, 2));

    alert = responseAlert;

    return false;
  };

  const url = `/incidents/${incidentId}/alerts?limit=1&sort_by=created_at&statuses[]=triggered&include[]=body`;
  console.log(`fetching ${url}`);
  const result = await fetchRetry(fetch)(createUrl(environment, url), init);
  if (result.ok && alert) {
    return alert;
  }
  return false;
}
