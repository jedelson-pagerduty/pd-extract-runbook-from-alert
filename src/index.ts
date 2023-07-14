import { ErrorWrapper, setCustomFieldValues, getFirstAlert } from './client';
import { Env } from './env';
import verifier from './verifySignature';
import logger, { LogEvent } from './logger';
import { WebhookEventPayload } from './webhook_data';

const TEST_TYPE = 'pagey.ping';
const TYPE = 'incident.triggered';

function createInvalidError(msg: string): Response {
  console.log(msg);
  return new Response(msg, {
    status: 400,
    statusText: msg,
  });
}

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const payload = await request.json<WebhookEventPayload>();
  if (payload.event && payload.event.event_type === TEST_TYPE) {
    return new Response(null, {
      status: 200,
    });
  }

  if (payload.event && payload.event.data && payload.event.data.id && payload.event.data.title) {
    if (payload.event.event_type !== TYPE) {
      return createInvalidError(`Wrong event type received. Was ${payload.event.event_type}`);
    }

    const incidentId = payload.event.data.id;
    const incidentTitle = payload.event.data.title;

    const logDetail: LogEvent = {
      incidentId,
      serviceId: payload.event.data.service.id,
      serviceName: payload.event.data.service.summary,
      incidentTitle,
    };

    const alert = await getFirstAlert(env, incidentId);

    if (alert) {
      const body = alert.body?.details?.body;
      if (body) {
        const match = /(RUNBOOK|Ops Guide): (?<runbook>[\S]*)/g.exec(body);
        if (match?.groups?.runbook) {
          const runbookUrl = match.groups.runbook;

          logDetail.runbookUrl = runbookUrl;

          const setResponse = await setCustomFieldValues(env, incidentId, [{
            name: 'runbook',
            value: runbookUrl,
          }]);

          if (!setResponse.ok) {
            const error = await setResponse.json<ErrorWrapper>();

            logDetail.error = error;

            const errorMsg = (error?.error?.errors && error.error.errors.length > 0) ? error.error.errors.join('; ') : error.error?.message;
            const msg = `could not set runbook to ${runbookUrl}: ${errorMsg}`;
            console.log(msg);

            ctx.waitUntil(logger.logFailure(env, logDetail));

            return new Response(msg);
          }

          ctx.waitUntil(logger.logSuccess(env, logDetail, runbookUrl));
          return new Response(runbookUrl);
        }

        ctx.waitUntil(logger.logFailure(env, logDetail, 404, 'did not match pattern', alert));
        return new Response('Did not match pattern');
      }

      ctx.waitUntil(logger.logFailure(env, logDetail, 404, 'no body in alert', alert));
      return new Response('No body in alert');
    }

    ctx.waitUntil(logger.logFailure(env, logDetail, 404, 'no alert'));
    return new Response('No alert');
  }
  return createInvalidError('Malformed payload');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { method } = request;
    if (method !== 'POST') {
      return createInvalidError(`Unexpected method ${method}`);
    }

    if (!request.body) {
      return createInvalidError('No body received');
    }

    const verified = await verifier.verifySignature(await request.clone().text(), env.PD_WEBHOOK_SECRET, request.headers);
    if (!verified) {
      return createInvalidError('Signature did not match');
    }

    return handle(request, env, ctx);
  },
};
