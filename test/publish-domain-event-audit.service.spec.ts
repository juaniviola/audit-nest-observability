import { PublishDomainEventAuditService } from "@lib/audit/application/publish-domain-event-audit.service";
import { RequestContextService } from "@lib/context/request-context.service";
import { DefaultAuditMapper } from "@lib/shared/default-audit.mapper";
import {
  AuditEventsRepository,
  EventMetadata,
  ObservabilityActorResolver,
  ObservabilityAuditMapper,
} from "@lib/shared/observability.types";

describe("PublishDomainEventAuditService", () => {
  it("maps a domain event into the audit contract using propagated request context", async () => {
    const repository: AuditEventsRepository = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const requestContextService = new RequestContextService();
    const service = new PublishDomainEventAuditService(
      repository,
      requestContextService,
      { resolveFromHttp: jest.fn() } as unknown as ObservabilityActorResolver,
      new DefaultAuditMapper(),
    );

    await requestContextService.run(
      {
        actorType: "user",
        actorId: "user-1",
        actorLabel: "11.111.111-1",
        organizationId: "org-1",
        requestId: "req-1",
      },
      async () => {
        await service.publish({
          eventName: "order.created",
          aggregateId: "order-1",
          occurredOn: "2026-04-22T13:32:01.449Z",
          attributes: { id: "order-1", amount: 1500 },
        });
      },
    );

    expect(repository.publish).toHaveBeenCalledWith({
      eventName: "order.created.domain.event",
      action: "create",
      resourceType: "order",
      resourceId: "order-1",
      actorType: "user",
      actorId: "user-1",
      actorLabel: "11.111.111-1",
      organizationId: "org-1",
      metadata: { id: "order-1", amount: 1500 },
      requestContext: {
        actorType: "user",
        actorId: "user-1",
        actorLabel: "11.111.111-1",
        organizationId: "org-1",
        requestId: "req-1",
      },
      occurredAt: "2026-04-22T13:32:01.449Z",
    });
  });

  it("allows overriding actor, action and resource mapping through extension points", async () => {
    const repository: AuditEventsRepository = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const requestContextService = new RequestContextService();
    const actorResolver: ObservabilityActorResolver = {
      resolveFromHttp: jest.fn(),
      resolveFromEvent: jest.fn().mockResolvedValue({
        actorType: "system",
        actorId: "resolver-user",
        actorLabel: "resolver-label",
      }),
    };
    const defaultAuditMapper = new DefaultAuditMapper();
    const auditMapper: ObservabilityAuditMapper = {
      resolveEventName: defaultAuditMapper.resolveEventName.bind(defaultAuditMapper),
      resolveOccurredAt: defaultAuditMapper.resolveOccurredAt.bind(defaultAuditMapper),
      resolveAction: jest.fn().mockResolvedValue("upsert"),
      resolveResource: jest.fn().mockResolvedValue({
        resourceType: "portfolio",
        resourceId: "portfolio-1",
      }),
      resolveMetadata: jest.fn().mockResolvedValue({ custom: true }),
    };
    const service = new PublishDomainEventAuditService(
      repository,
      requestContextService,
      actorResolver,
      auditMapper,
    );

    const metadata: EventMetadata = {
      routingKey: "holding.updated",
    };

    await service.publish(
      {
        eventName: "holding.updated",
        aggregateId: "holding-1",
        attributes: { accountId: "portfolio-1" },
      },
      metadata,
    );

    expect(repository.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "holding.updated.domain.event",
        action: "upsert",
        resourceType: "portfolio",
        resourceId: "portfolio-1",
        actorType: "system",
        actorId: "resolver-user",
        actorLabel: "resolver-label",
        metadata: { custom: true },
      }),
    );
  });
});
