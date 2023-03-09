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

export async function setCustomFieldValues(env: Env, incidentId: string, values: CustomFieldValue[]): Promise<Response> {
  const init: RequestInitWithRetry = {
    method: 'PUT',
    body: JSON.stringify({ field_values: values }),
    headers: {
      Accept: 'application/vnd.pagerduty+json;version=2',
      'Content-Type': 'application/json',
      'X-Early-Access': 'flex-service-early-access',
      Authorization: `Token token=${env.PD_API_KEY}`,
    },
    retries: 3,
    retryDelay: 1000,
    retryOn: [500, 429],
  };

  return fetchRetry(fetch)(`https://api.pagerduty.com/incidents/${incidentId}/field_values`, init);
}

export async function getFirstAlert(env: Env, incidentId: string): Promise<Alert | undefined> {
  const init: RequestInitWithRetry = {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.pagerduty+json;version=2',
      'Content-Type': 'application/json',
      'X-Early-Access': 'flex-service-early-access',
      Authorization: `Token token=${env.PD_API_KEY}`,
    },
    retries: 3,
    retryDelay: 1000,
    retryOn: [500, 429],
  };

  const result = await fetchRetry(fetch)(`https://api.pagerduty.com/incidents/${incidentId}/alerts?limit=1&sort_by=created_at&statuses[]=triggered`, init);
  if (result.ok) {
    const body = await result.json<AlertResponse>();
    if (body.alerts && body.alerts.length == 1) {
      return body.alerts[0];
    }
  }
  return;

}