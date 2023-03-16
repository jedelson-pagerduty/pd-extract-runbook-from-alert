/* eslint-disable max-classes-per-file */
import fetchRetry, { RequestInitWithRetry } from 'fetch-retry';
import { Env } from './env';

class CustomFieldValue {
  name!: string;

  value: any;
}

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

function createUrl(env: Env, path: string): string {
  const domain = env.PD_API_DOMAIN || 'api.pagerduty.com';
  return `https://${domain}${path}`;
}

function createInit(env: Env, method: string, includeEarlyAccessHeader: boolean = false): RequestInitWithRetry {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.pagerduty+json;version=2',
    'Content-Type': 'application/json',
    Authorization: `Token token=${env.PD_API_KEY}`,
  };

  if (includeEarlyAccessHeader) {
    headers['X-Early-Access'] = 'flex-service-early-access';
  }

  return {
    method,
    headers,
    retryDelay: 1000,
  };
}

export async function setCustomFieldValues(env: Env, incidentId: string, values: CustomFieldValue[]): Promise<Response> {
  const init = createInit(env, 'PUT', true);
  init.retries = 3;
  init.retryOn = [500, 429];
  init.body = JSON.stringify({ field_values: values });

  return fetchRetry(fetch)(createUrl(env, `/incidents/${incidentId}/field_values`), init);
}

export async function getFirstAlert(env: Env, incidentId: string): Promise<Alert | false> {
  const init = createInit(env, 'GET');

  let alert;

  // sometimes alerts are not fully hydrated immediately after incident creation. This retry logic attempts to ensure that a hydrated alert is used.
  init.retryOn = async function retry(attempt, error, response) {
    if (attempt === 3) {
      console.log(`giving up fetching alert after ${attempt} attempts`);
      return false;
    }

    console.log(`Attempt #${attempt + 1}: Request ID: ${response?.headers.get('x-request-id')}`);

    if (error !== null || response == null || response.status === 500 || response.status === 429) {
      console.log('Retrying due to error');
      return true;
    }

    const responseBody = await response.json<AlertResponse>();
    if (!responseBody.alerts || responseBody.alerts.length === 0) {
      console.log('response body did not not contain alert. Assuming this is correct.');
      return false;
    }

    const [responseAlert] = responseBody.alerts;

    if (!responseAlert.body) {
      console.log('retrying due to alert having no body');
      // console.log(JSON.stringify(responseAlert, null, 2));
      return true;
    }

    console.log('alert with body received');
    // console.log(JSON.stringify(responseAlert.body, null, 2));

    alert = responseAlert;

    return false;
  };

  const result = await fetchRetry(fetch)(createUrl(env, `/incidents/${incidentId}/alerts?limit=1&sort_by=created_at&statuses[]=triggered`), init);
  if (result.ok && alert) {
    return alert;
  }
  return false;
}
