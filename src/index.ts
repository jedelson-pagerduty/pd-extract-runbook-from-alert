import { ErrorWrapper, getFirstAlert, setCustomFieldValues } from "./client";
import { Environment } from "./environment";
import logger, { LogEvent } from "./logger";
import verifier from "./verify-signature";
import { WebhookEventPayload } from "./webhook-data";

const TEST_TYPE = "pagey.ping";
const TYPE = "incident.triggered";

function createInvalidError(message: string): Response {
  console.log(message);
  return new Response(message, {
    status: 400,
    statusText: message,
  });
}

async function handle(
  request: Request,
  environment: Environment,
  context: ExecutionContext,
): Promise<Response> {
  const payload = await request.json<WebhookEventPayload>();
  if (payload.event && payload.event.event_type === TEST_TYPE) {
    return new Response(undefined, {
      status: 200,
    });
  }

  if (
    payload.event &&
    payload.event.data &&
    payload.event.data.id &&
    payload.event.data.title
  ) {
    if (payload.event.event_type !== TYPE) {
      return createInvalidError(
        `Wrong event type received. Was ${payload.event.event_type}`,
      );
    }

    const incidentId = payload.event.data.id;
    const incidentTitle = payload.event.data.title;

    const logDetail: LogEvent = {
      incidentId,
      serviceId: payload.event.data.service.id,
      serviceName: payload.event.data.service.summary,
      incidentTitle,
    };

    const alert = await getFirstAlert(environment, incidentId);

    if (alert) {
      const body = alert.body?.details?.body;
      if (body) {
        const match = /(RUNBOOK|Ops Guide): (?<runbook>\S*)/g.exec(body);
        if (match?.groups?.runbook) {
          const runbookUrl = match.groups.runbook;

          logDetail.runbookUrl = runbookUrl;

          const setResponse = await setCustomFieldValues(
            environment,
            incidentId,
            [
              {
                name: "runbook",
                value: runbookUrl,
              },
            ],
          );

          if (!setResponse.ok) {
            const error = await setResponse.json<ErrorWrapper>();

            logDetail.error = error;

            const errorMessage =
              error?.error?.errors && error.error.errors.length > 0
                ? error.error.errors.join("; ")
                : error.error?.message;
            const message = `could not set runbook to ${runbookUrl}: ${errorMessage}`;
            console.log(message);

            context.waitUntil(logger.logFailure(environment, logDetail));

            return new Response(message);
          }

          context.waitUntil(
            logger.logSuccess(environment, logDetail, runbookUrl),
          );
          return new Response(runbookUrl);
        }

        context.waitUntil(
          logger.logFailure(
            environment,
            logDetail,
            404,
            "did not match pattern",
            alert,
          ),
        );
        return new Response("Did not match pattern");
      }

      context.waitUntil(
        logger.logFailure(
          environment,
          logDetail,
          404,
          "no body in alert",
          alert,
        ),
      );
      return new Response("No body in alert");
    }

    context.waitUntil(
      logger.logFailure(environment, logDetail, 404, "no alert"),
    );
    return new Response("No alert");
  }
  return createInvalidError("Malformed payload");
}

export default {
  async fetch(
    request: Request,
    environment: Environment,
    context: ExecutionContext,
  ): Promise<Response> {
    const { method, body, headers } = request;
    if (method !== "POST") {
      return createInvalidError(`Unexpected method ${method}`);
    }

    if (!body) {
      return createInvalidError("No body received");
    }

    const verified = await verifier.verifySignature(
      await request.clone().text(),
      environment.PD_WEBHOOK_SECRET,
      headers,
    );
    if (!verified) {
      return createInvalidError("Signature did not match");
    }

    return handle(request, environment, context);
  },
};
