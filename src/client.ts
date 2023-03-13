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
    retries: 3,
    retryDelay: 1000,
    retryOn: [500, 429],
  };
}

export async function setCustomFieldValues(env: Env, incidentId: string, values: CustomFieldValue[]): Promise<Response> {
  const init = createInit(env, 'PUT', true);
  init.body = JSON.stringify({ field_values: values });

  return fetchRetry(fetch)(createUrl(env, `/incidents/${incidentId}/field_values`), init);
}

export async function getFirstAlert(env: Env, incidentId: string): Promise<Alert | false> {
  const init = createInit(env, 'GET');

  const result = await fetchRetry(fetch)(createUrl(env, `/incidents/${incidentId}/alerts?limit=1&sort_by=created_at&statuses[]=triggered`), init);
  if (result.ok) {
    const body = await result.json<AlertResponse>();
    if (body.alerts && body.alerts.length === 1) {
      return body.alerts[0];
    }
  }
  return false;
}
