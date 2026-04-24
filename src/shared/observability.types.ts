import { DynamicModule, ModuleMetadata, Provider, Type } from "@nestjs/common";
import { Request } from "express";

import { AuditEvent } from "../audit/domain/audit-event";
import { RequestLog } from "../http/domain/request-log";

export type MaybePromise<T> = T | Promise<T>;
export type ObservabilityProviderToken = string | symbol | Type<unknown>;
export type EventPayload = Record<string, unknown>;

export type ObservabilityActorType = "user" | "anonymous" | "system";

export type ObservabilityActorContext = {
  actorType: ObservabilityActorType;
  actorId?: string;
  actorLabel?: string;
  organizationId?: string;
};

export type RequestContext = ObservabilityActorContext & {
  requestId?: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
  referer?: string;
  origin?: string;
  method?: string;
  path?: string;
  route?: string;
  [key: string]: unknown;
};

export type EventMetadata = {
  routingKey?: string;
  headers?: Record<string, unknown>;
  requestContext?: RequestContext;
  auditContext?: RequestContext;
};

export interface ObservabilityActorResolver {
  resolveFromHttp(
    request: Request,
  ): MaybePromise<Partial<ObservabilityActorContext> | undefined>;
  resolveFromEvent?(params: {
    event: EventPayload;
    metadata?: EventMetadata;
    requestContext?: RequestContext;
  }): MaybePromise<Partial<ObservabilityActorContext> | undefined>;
}

export interface ObservabilityRequestContextResolver {
  resolve(request: Request): MaybePromise<Partial<RequestContext>>;
}

export interface ObservabilityPayloadSanitizer {
  sanitize(value: unknown): unknown;
}

export type RequestLogErrorDetails = Pick<
  RequestLog,
  "status" | "errorCode" | "errorMessage" | "responseBody"
>;

export interface ObservabilityRequestLogErrorMapper {
  map(
    error: unknown,
    params: { request: Request },
  ): MaybePromise<Partial<RequestLogErrorDetails> | undefined>;
}

export interface ObservabilityAuditMapper {
  resolveEventName?(params: {
    event: EventPayload;
    metadata?: EventMetadata;
    requestContext?: RequestContext;
  }): MaybePromise<string | undefined>;
  resolveAction?(params: {
    event: EventPayload;
    metadata?: EventMetadata;
    requestContext?: RequestContext;
    eventName: string;
  }): MaybePromise<string | undefined>;
  resolveResource?(params: {
    event: EventPayload;
    metadata?: EventMetadata;
    requestContext?: RequestContext;
    eventName: string;
  }): MaybePromise<
    Partial<Pick<AuditEvent, "resourceType" | "resourceId">> | undefined
  >;
  resolveActor?(params: {
    event: EventPayload;
    metadata?: EventMetadata;
    requestContext?: RequestContext;
    eventName: string;
  }): MaybePromise<Partial<ObservabilityActorContext> | undefined>;
  resolveMetadata?(params: {
    event: EventPayload;
    metadata?: EventMetadata;
    requestContext?: RequestContext;
    eventName: string;
  }): MaybePromise<unknown>;
  resolveOccurredAt?(params: {
    event: EventPayload;
    metadata?: EventMetadata;
    requestContext?: RequestContext;
    eventName: string;
  }): MaybePromise<string | undefined>;
}

export type ObservabilityRequestLogsOptions = {
  enabled?: boolean;
  url?: string;
  timeoutMs?: number;
  includeMethods?: string[];
  excludePaths?: Array<string | RegExp>;
};

export interface ObservabilityEventBus {
  register(
    event: string,
    handler: (payload: EventPayload, metadata?: EventMetadata) => Promise<void>,
    name?: string,
  ): Promise<void>;
}

export type ObservabilityAuditWildcardConsumerOptions = {
  enabled?: boolean;
  pattern?: string;
  queueName?: string;
  eventBusToken?: ObservabilityProviderToken;
};

export type ObservabilityAuditEventsOptions = {
  enabled?: boolean;
  url?: string;
  timeoutMs?: number;
  wildcardConsumer?: ObservabilityAuditWildcardConsumerOptions;
};

export type ObservabilityModuleOptions = {
  sourceApp: string;
  sourceEnv: string;
  requestLogs?: ObservabilityRequestLogsOptions;
  auditEvents?: ObservabilityAuditEventsOptions;
  actorResolver?: ObservabilityActorResolver;
  requestContextResolver?: ObservabilityRequestContextResolver;
  payloadSanitizer?: ObservabilityPayloadSanitizer;
  requestLogErrorMapper?: ObservabilityRequestLogErrorMapper;
  auditMapper?: ObservabilityAuditMapper;
};

export type ObservabilityModuleAsyncOptions = Pick<
  ModuleMetadata,
  "imports"
> & {
  inject?: Array<string | symbol | Type<unknown>>;
  useFactory: (...args: unknown[]) => MaybePromise<ObservabilityModuleOptions>;
  extraProviders?: Provider[];
};

export interface RequestLogsRepository {
  publish(requestLog: RequestLog): Promise<void>;
}

export interface AuditEventsRepository {
  publish(auditEvent: AuditEvent): Promise<void>;
}

export type RabbitMqPublishOptions = {
  headers?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RabbitMqMessageLike = {
  fields?: {
    routingKey?: string;
  };
  properties?: {
    headers?: Record<string, unknown>;
  };
};

export type ObservabilityModuleFactory = {
  forRoot(options: ObservabilityModuleOptions): DynamicModule;
  forRootAsync(options: ObservabilityModuleAsyncOptions): DynamicModule;
};
