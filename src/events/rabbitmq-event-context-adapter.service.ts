import { Injectable } from "@nestjs/common";

import {
  EventMetadata,
  RabbitMqMessageLike,
  RabbitMqPublishOptions,
} from "../shared/observability.types";
import { ConsumerContextRunnerService } from "./consumer-context-runner.service";
import { EventContextPropagatorService } from "./event-context-propagator.service";

@Injectable()
export class RabbitMqEventContextAdapterService {
  constructor(
    private readonly eventContextPropagator: EventContextPropagatorService,
    private readonly consumerContextRunner: ConsumerContextRunnerService,
  ) {}

  createPublishOptions<T extends RabbitMqPublishOptions>(
    options?: T,
  ): T & { headers?: Record<string, unknown> } {
    const normalizedOptions = (options ?? {}) as T;
    const headers = this.eventContextPropagator.createHeaders(
      normalizedOptions.headers ?? {},
    );

    return {
      ...normalizedOptions,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  }

  toEventMetadata(message: RabbitMqMessageLike): EventMetadata {
    const headers = message.properties?.headers ?? {};
    const requestContext = this.eventContextPropagator.extract({ headers });

    return {
      routingKey: message.fields?.routingKey,
      headers,
      ...(requestContext ? { requestContext, auditContext: requestContext } : {}),
    };
  }

  runWithMessage<T>(message: RabbitMqMessageLike, callback: () => T): T {
    return this.consumerContextRunner.runWithMetadata(
      this.toEventMetadata(message),
      callback,
    );
  }
}
