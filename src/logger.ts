import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { ErrorWrapper } from "./client";
import { Environment } from "./environment";

export interface LogEvent {
  incidentId: string;
  error?: ErrorWrapper;
  runbookUrl?: string;
  success?: boolean;
  serviceId: string;
  serviceName: string;
  incidentTitle: string;
  extra?: string;
}

async function log(environment: Environment, object: LogEvent): Promise<void> {
  if (environment.ENABLE_EVENT_LOGGING !== "true") {
    console.log("event logging disabled");
    console.log(object);
    return;
  }

  const parameters = {
    Entries: [
      {
        Detail: JSON.stringify(object),
        DetailType: "extract-runbook-from-alert-webhook",
        Source: environment.EVENT_SOURCE,
        EventBusName: environment.EVENT_BUS_NAME,
      },
    ],
  };

  try {
    const ebClient = new EventBridgeClient({
      region: environment.AWS_REGION,
      credentials: {
        accessKeyId: environment.AWS_ACCESS_KEY_ID,
        secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
      },
    });
    const data = await ebClient.send(new PutEventsCommand(parameters));
    console.log("Success, event sent; requestID:", data);
  } catch (error) {
    console.log("Error", error);
  }
}

export default {
  async logFailure(
    environment: Environment,
    object: LogEvent,
    errorCode?: number,
    errorMessage?: string,
    extra?: object,
  ): Promise<void> {
    const fullObject: LogEvent = {
      ...object,
      success: false,
    };
    if (extra) {
      fullObject.extra = JSON.stringify(extra);
    }

    if (errorCode && errorMessage) {
      fullObject.error = {
        error: {
          code: errorCode,
          message: errorMessage,
        },
      };
    }
    return log(environment, fullObject);
  },

  async logSuccess(
    environment: Environment,
    object: LogEvent,
    runbookUrl: string,
  ): Promise<void> {
    const fullObject: LogEvent = {
      ...object,
      success: true,
      runbookUrl,
    };
    return log(environment, fullObject);
  },
};
