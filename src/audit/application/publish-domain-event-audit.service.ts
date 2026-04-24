import { Inject, Injectable } from "@nestjs/common";

import { RequestContextService } from "../../context/request-context.service";
import {
  OBSERVABILITY_ACTOR_RESOLVER,
  OBSERVABILITY_AUDIT_EVENTS_REPOSITORY,
  OBSERVABILITY_AUDIT_MAPPER,
} from "../../shared/observability.constants";
import {
  AuditEventsRepository,
  EventMetadata,
  EventPayload,
  ObservabilityActorResolver,
  ObservabilityActorType,
  ObservabilityAuditMapper,
  RequestContext,
} from "../../shared/observability.types";
import { AuditEvent } from "../domain/audit-event";

@Injectable()
export class PublishDomainEventAuditService {
  constructor(
    @Inject(OBSERVABILITY_AUDIT_EVENTS_REPOSITORY)
    private readonly auditEventsRepository: AuditEventsRepository,
    private readonly requestContextService: RequestContextService,
    @Inject(OBSERVABILITY_ACTOR_RESOLVER)
    private readonly actorResolver: ObservabilityActorResolver,
    @Inject(OBSERVABILITY_AUDIT_MAPPER)
    private readonly auditMapper: ObservabilityAuditMapper,
  ) {}

  async publish(
    domainEvent: EventPayload,
    metadata?: EventMetadata,
  ): Promise<void> {
    await this.auditEventsRepository.publish(
      await this.toAuditEvent(domainEvent, metadata),
    );
  }

  private async toAuditEvent(
    domainEvent: EventPayload,
    metadata?: EventMetadata,
  ): Promise<AuditEvent> {
    const requestContext = this.resolveRequestContext(metadata);
    const eventName = this.withDomainEventSuffix(
      (await this.auditMapper.resolveEventName?.({
        event: domainEvent,
        metadata,
        requestContext,
      })) ?? "unknown.domain-event",
    );
    const resource =
      (await this.auditMapper.resolveResource?.({
        event: domainEvent,
        metadata,
        requestContext,
        eventName,
      })) ?? {};
    const actorFromResolver = await this.actorResolver.resolveFromEvent?.({
      event: domainEvent,
      metadata,
      requestContext,
    });
    const actor = {
      ...(await this.auditMapper.resolveActor?.({
        event: domainEvent,
        metadata,
        requestContext,
        eventName,
      })),
      ...actorFromResolver,
      ...(requestContext?.actorType ? { actorType: requestContext.actorType } : {}),
      ...(requestContext?.actorId ? { actorId: String(requestContext.actorId) } : {}),
      ...(requestContext?.actorLabel
        ? { actorLabel: String(requestContext.actorLabel) }
        : {}),
      ...(requestContext?.organizationId
        ? { organizationId: String(requestContext.organizationId) }
        : {}),
    };
    const actorId =
      typeof actor.actorId === "string" && actor.actorId.length > 0
        ? actor.actorId
        : undefined;
    const actorType = this.normalizeActorType(actor.actorType, actorId);

    return {
      eventName,
      action:
        (await this.auditMapper.resolveAction?.({
          event: domainEvent,
          metadata,
          requestContext,
          eventName,
        })) ?? "unknown",
      resourceType:
        typeof resource.resourceType === "string" && resource.resourceType.length > 0
          ? resource.resourceType
          : eventName.split(".")[0] || "unknown",
      resourceId:
        typeof resource.resourceId === "string" && resource.resourceId.length > 0
          ? resource.resourceId
          : "unknown",
      actorType,
      ...(actorId ? { actorId } : {}),
      ...(typeof actor.actorLabel === "string" && actor.actorLabel.length > 0
        ? { actorLabel: actor.actorLabel }
        : {}),
      ...(typeof actor.organizationId === "string" &&
      actor.organizationId.length > 0
        ? { organizationId: actor.organizationId }
        : {}),
      metadata:
        (await this.auditMapper.resolveMetadata?.({
          event: domainEvent,
          metadata,
          requestContext,
          eventName,
        })) ?? domainEvent,
      ...(requestContext ? { requestContext } : {}),
      occurredAt: this.normalizeDate(
        await this.auditMapper.resolveOccurredAt?.({
          event: domainEvent,
          metadata,
          requestContext,
          eventName,
        }),
      ),
    };
  }

  private resolveRequestContext(
    metadata?: EventMetadata,
  ): RequestContext | undefined {
    return (
      metadata?.requestContext ??
      metadata?.auditContext ??
      this.requestContextService.get()
    );
  }

  private withDomainEventSuffix(eventName: string): string {
    return eventName.endsWith(".domain.event")
      ? eventName
      : `${eventName}.domain.event`;
  }

  private normalizeActorType(
    actorType: string | undefined,
    actorId?: string,
  ): ObservabilityActorType {
    if (actorType === "user" || actorType === "system" || actorType === "anonymous") {
      return actorType;
    }

    return actorId ? "user" : "system";
  }

  private normalizeDate(value?: string): string {
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime())
      ? new Date().toISOString()
      : parsed.toISOString();
  }
}
