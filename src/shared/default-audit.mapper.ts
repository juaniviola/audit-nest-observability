import { Injectable } from "@nestjs/common";

import {
  EventPayload,
  EventMetadata,
  ObservabilityActorContext,
  ObservabilityAuditMapper,
  RequestContext,
} from "./observability.types";

@Injectable()
export class DefaultAuditMapper implements ObservabilityAuditMapper {
  resolveEventName(params: {
    event: EventPayload;
    metadata?: EventMetadata;
  }): string {
    return (
      this.asString(params.event.eventName) ??
      params.metadata?.routingKey ??
      "unknown.domain-event"
    );
  }

  resolveAction(params: { eventName: string }): string {
    const normalizedEventName = params.eventName.endsWith(".domain.event")
      ? params.eventName.replace(/\.domain\.event$/, "")
      : params.eventName;
    const action = normalizedEventName.split(".").at(-1) ?? "unknown";
    const actionMap: Record<string, string> = {
      accepted: "accept",
      added: "add",
      canceled: "cancel",
      cancelled: "cancel",
      changed: "change",
      completed: "complete",
      created: "create",
      deleted: "delete",
      executed: "execute",
      failed: "fail",
      finalized: "finalize",
      generated: "generate",
      opened: "open",
      reached: "reach",
      rejected: "reject",
      sent: "send",
      submitted: "submit",
      synced: "sync",
      updated: "update",
      verified: "verify",
    };

    return actionMap[action] ?? action;
  }

  resolveResource(params: {
    event: EventPayload;
    eventName: string;
  }): { resourceType: string; resourceId: string } {
    const resourceType = params.eventName.split(".")[0] || "unknown";

    return {
      resourceType,
      resourceId:
        this.asString(params.event.aggregateId) ??
        this.findStringByPath(params.event, ["attributes", "id"]) ??
        this.findStringByPath(params.event, [resourceType, "id"]) ??
        this.asString(params.event.id) ??
        this.findStringRecursively(params.event, ["id"]) ??
        "unknown",
    };
  }

  resolveActor(params: {
    event: EventPayload;
    requestContext?: RequestContext;
  }): Partial<ObservabilityActorContext> | undefined {
    const requestContext = params.requestContext;

    if (requestContext?.actorId) {
      return {
        actorType: requestContext.actorType ?? "user",
        actorId: requestContext.actorId,
        actorLabel:
          typeof requestContext.actorLabel === "string"
            ? requestContext.actorLabel
            : requestContext.actorId,
        organizationId:
          typeof requestContext.organizationId === "string"
            ? requestContext.organizationId
            : undefined,
      };
    }

    const attributes = this.asRecord(params.event.attributes);
    const actorId =
      this.findStringByPath(attributes, ["userId"]) ??
      this.findStringByPath(attributes, ["user", "id"]) ??
      this.findStringByPath(params.event, ["userId"]) ??
      this.findStringByPath(params.event, ["user", "id"]) ??
      this.findStringByPath(attributes, ["clientId"]) ??
      this.findStringByPath(params.event, ["clientId"]) ??
      this.findStringRecursively(params.event, ["userId", "clientId", "actorId"]);

    if (!actorId) {
      return {
        actorType: "system",
        actorId: "system",
        actorLabel: "system",
      };
    }

    return {
      actorType: "user",
      actorId,
      actorLabel:
        this.findStringByPath(attributes, ["actorLabel"]) ??
        this.findStringByPath(attributes, ["clientRut"]) ??
        this.findStringByPath(attributes, ["email"]) ??
        this.findStringByPath(attributes, ["name"]) ??
        this.findStringRecursively(params.event, [
          "actorLabel",
          "clientRut",
          "email",
          "name",
        ]) ??
        actorId,
    };
  }

  resolveMetadata(params: { event: EventPayload }): unknown {
    return params.event.attributes ?? params.event;
  }

  resolveOccurredAt(params: { event: EventPayload }): string | undefined {
    return (
      this.asString(params.event.occurredOn) ??
      this.asString(params.event.occurredAt)
    );
  }

  private findStringByPath(source: unknown, path: string[]): string | undefined {
    let current: unknown = source;

    for (const segment of path) {
      const currentRecord = this.asRecord(current);
      if (!currentRecord) {
        return undefined;
      }

      current = currentRecord[segment];
    }

    return this.asString(current);
  }

  private findStringRecursively(
    source: unknown,
    candidateKeys: string[],
  ): string | undefined {
    const sourceRecord = this.asRecord(source);

    if (!sourceRecord) {
      return undefined;
    }

    for (const candidateKey of candidateKeys) {
      const value = this.asString(sourceRecord[candidateKey]);
      if (value) {
        return value;
      }
    }

    for (const value of Object.values(sourceRecord)) {
      const nestedValue = this.findStringRecursively(value, candidateKeys);
      if (nestedValue) {
        return nestedValue;
      }
    }

    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    return undefined;
  }
}
