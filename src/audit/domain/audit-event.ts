export type AuditEvent = {
  eventName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorType: "user" | "system" | "anonymous";
  actorId?: string;
  actorLabel?: string;
  organizationId?: string;
  metadata: unknown;
  requestContext?: Record<string, unknown>;
  occurredAt: string;
};
