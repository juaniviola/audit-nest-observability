import { ModuleRef } from "@nestjs/core";

import { PublishDomainEventAuditService } from "@lib/audit/application/publish-domain-event-audit.service";
import {
  AuditWildcardConsumer,
  AuditWildcardConsumerHandler,
} from "@lib/audit/infrastructure/audit-wildcard-consumer";
import { RequestContextService } from "@lib/context/request-context.service";
import { ConsumerContextRunnerService } from "@lib/events/consumer-context-runner.service";
import { EventContextPropagatorService } from "@lib/events/event-context-propagator.service";
import { EventMetadata, ObservabilityEventBus } from "@lib/shared/observability.types";

describe("AuditWildcardConsumer", () => {
  it("registers a wildcard consumer and republishes events with the rehydrated request context", async () => {
    const eventBus: ObservabilityEventBus = {
      register: jest.fn().mockResolvedValue(undefined),
    };
    const requestContextService = new RequestContextService();
    const publish = jest.fn().mockResolvedValue(undefined);
    const handler = new AuditWildcardConsumerHandler(
      new ConsumerContextRunnerService(
        requestContextService,
        new EventContextPropagatorService(requestContextService),
      ),
      {
        publish,
      } as unknown as PublishDomainEventAuditService,
    );
    const consumer = new AuditWildcardConsumer(
      {
        sourceApp: "orders-api",
        sourceEnv: "production",
        requestLogs: { enabled: false },
        auditEvents: {
          enabled: true,
          wildcardConsumer: {
            enabled: true,
            pattern: "#",
            queueName: "audit-events.on-any-domain-event",
            eventBusToken: Symbol.for("EVENT_BUS"),
          },
        },
      },
      {
        get: jest.fn().mockReturnValue(eventBus),
      } as unknown as ModuleRef,
      handler,
    );

    await consumer.onModuleInit();

    expect(eventBus.register).toHaveBeenCalledWith(
      "#",
      expect.any(Function),
      "audit-events.on-any-domain-event",
    );

    const registeredHandler = (eventBus.register as jest.Mock).mock.calls[0][1] as (
      payload: Record<string, unknown>,
      metadata?: EventMetadata,
    ) => Promise<void>;

    await registeredHandler(
      { eventName: "reservation.created", aggregateId: "reservation-1" },
      {
        routingKey: "reservation.created",
        auditContext: {
          actorType: "user",
          actorId: "user-1",
          actorLabel: "11.111.111-1",
        },
      },
    );

    expect(publish).toHaveBeenCalledWith(
      { eventName: "reservation.created", aggregateId: "reservation-1" },
      {
        routingKey: "reservation.created",
        auditContext: {
          actorType: "user",
          actorId: "user-1",
          actorLabel: "11.111.111-1",
        },
      },
    );
  });
});
