import {
  DynamicModule,
  Global,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  Provider,
} from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { PublishDomainEventAuditService } from "./audit/application/publish-domain-event-audit.service";
import {
  AuditWildcardConsumer,
  AuditWildcardConsumerHandler,
} from "./audit/infrastructure/audit-wildcard-consumer";
import { HttpAuditEventsRepository } from "./audit/infrastructure/http-audit-events.repository";
import { RequestContextService } from "./context/request-context.service";
import { HttpRequestContextMiddleware } from "./context/http-request-context.middleware";
import { ConsumerContextRunnerService } from "./events/consumer-context-runner.service";
import { EventContextPropagatorService } from "./events/event-context-propagator.service";
import { RabbitMqEventContextAdapterService } from "./events/rabbitmq-event-context-adapter.service";
import { PublishRequestLogService } from "./http/application/publish-request-log.service";
import { HttpRequestLogsRepository } from "./http/infrastructure/http-request-logs.repository";
import { RequestLogInterceptor } from "./http/infrastructure/request-log.interceptor";
import { DefaultActorResolver } from "./shared/default-actor.resolver";
import { DefaultAuditMapper } from "./shared/default-audit.mapper";
import { DefaultPayloadSanitizer } from "./shared/default-payload-sanitizer";
import { DefaultRequestContextResolver } from "./shared/default-request-context.resolver";
import { DefaultRequestLogErrorMapper } from "./shared/default-request-log-error.mapper";
import {
  OBSERVABILITY_ACTOR_RESOLVER,
  OBSERVABILITY_AUDIT_EVENTS_REPOSITORY,
  OBSERVABILITY_AUDIT_MAPPER,
  OBSERVABILITY_OPTIONS,
  OBSERVABILITY_PAYLOAD_SANITIZER,
  OBSERVABILITY_REQUEST_CONTEXT_RESOLVER,
  OBSERVABILITY_REQUEST_LOG_ERROR_MAPPER,
  OBSERVABILITY_REQUEST_LOGS_REPOSITORY,
} from "./shared/observability.constants";
import {
  ObservabilityModuleAsyncOptions,
  ObservabilityModuleOptions,
} from "./shared/observability.types";

@Global()
@Module({})
export class ObservabilityModule implements NestModule {
  constructor(
    @Inject(OBSERVABILITY_OPTIONS)
    private readonly options: ObservabilityModuleOptions,
  ) {}

  configure(consumer: MiddlewareConsumer): void {
    if (
      this.options.requestLogs?.enabled === false &&
      this.options.auditEvents?.enabled === false
    ) {
      return;
    }

    consumer.apply(HttpRequestContextMiddleware).forRoutes("*");
  }

  static forRoot(options: ObservabilityModuleOptions): DynamicModule {
    const normalizedOptions = normalizeOptions(options);

    return {
      module: ObservabilityModule,
      providers: [
        { provide: OBSERVABILITY_OPTIONS, useValue: normalizedOptions },
        ...this.commonProviders(),
      ],
      exports: this.commonExports(),
    };
  }

  static forRootAsync(options: ObservabilityModuleAsyncOptions): DynamicModule {
    return {
      module: ObservabilityModule,
      imports: options.imports ?? [],
      providers: [
        ...(options.extraProviders ?? []),
        {
          provide: OBSERVABILITY_OPTIONS,
          useFactory: async (...args: unknown[]) =>
            normalizeOptions(await options.useFactory(...args)),
          inject: options.inject ?? [],
        },
        ...this.commonProviders(),
      ],
      exports: this.commonExports(),
    };
  }

  private static commonProviders(): Provider[] {
    return [
      RequestContextService,
      EventContextPropagatorService,
      ConsumerContextRunnerService,
      RabbitMqEventContextAdapterService,
      HttpRequestContextMiddleware,
      PublishRequestLogService,
      PublishDomainEventAuditService,
      AuditWildcardConsumerHandler,
      AuditWildcardConsumer,
      HttpRequestLogsRepository,
      HttpAuditEventsRepository,
      DefaultAuditMapper,
      DefaultRequestLogErrorMapper,
      {
        provide: OBSERVABILITY_ACTOR_RESOLVER,
        useFactory: (options: ObservabilityModuleOptions) =>
          options.actorResolver ?? new DefaultActorResolver(),
        inject: [OBSERVABILITY_OPTIONS],
      },
      {
        provide: OBSERVABILITY_REQUEST_CONTEXT_RESOLVER,
        useFactory: (options: ObservabilityModuleOptions) =>
          options.requestContextResolver ?? new DefaultRequestContextResolver(),
        inject: [OBSERVABILITY_OPTIONS],
      },
      {
        provide: OBSERVABILITY_PAYLOAD_SANITIZER,
        useFactory: (options: ObservabilityModuleOptions) =>
          options.payloadSanitizer ?? new DefaultPayloadSanitizer(),
        inject: [OBSERVABILITY_OPTIONS],
      },
      {
        provide: OBSERVABILITY_REQUEST_LOG_ERROR_MAPPER,
        useFactory: (options: ObservabilityModuleOptions) =>
          composeRequestLogErrorMapper(
            new DefaultRequestLogErrorMapper(),
            options.requestLogErrorMapper,
          ),
        inject: [OBSERVABILITY_OPTIONS],
      },
      {
        provide: OBSERVABILITY_AUDIT_MAPPER,
        useFactory: (options: ObservabilityModuleOptions) =>
          composeAuditMapper(new DefaultAuditMapper(), options.auditMapper),
        inject: [OBSERVABILITY_OPTIONS],
      },
      {
        provide: OBSERVABILITY_REQUEST_LOGS_REPOSITORY,
        useClass: HttpRequestLogsRepository,
      },
      {
        provide: OBSERVABILITY_AUDIT_EVENTS_REPOSITORY,
        useClass: HttpAuditEventsRepository,
      },
      {
        provide: APP_INTERCEPTOR,
        useClass: RequestLogInterceptor,
      },
    ];
  }

  private static commonExports(): Array<string | symbol | Provider | Function> {
    return [
      RequestContextService,
      EventContextPropagatorService,
      ConsumerContextRunnerService,
      RabbitMqEventContextAdapterService,
      PublishRequestLogService,
      PublishDomainEventAuditService,
      AuditWildcardConsumerHandler,
      AuditWildcardConsumer,
      OBSERVABILITY_OPTIONS,
      OBSERVABILITY_ACTOR_RESOLVER,
      OBSERVABILITY_REQUEST_CONTEXT_RESOLVER,
      OBSERVABILITY_PAYLOAD_SANITIZER,
      OBSERVABILITY_REQUEST_LOG_ERROR_MAPPER,
      OBSERVABILITY_AUDIT_MAPPER,
      OBSERVABILITY_REQUEST_LOGS_REPOSITORY,
      OBSERVABILITY_AUDIT_EVENTS_REPOSITORY,
    ];
  }
}

function normalizeOptions(
  options: ObservabilityModuleOptions,
): ObservabilityModuleOptions {
  if (
    options.auditTrail &&
    (!options.auditTrail.clientId || !options.auditTrail.apiKey)
  ) {
    throw new Error(
      "ObservabilityModule requires both auditTrail.clientId and auditTrail.apiKey when audit trail signing is configured",
    );
  }

  const normalizedOptions: ObservabilityModuleOptions = {
    ...options,
    auditTrail: options.auditTrail
      ? {
          clientId: options.auditTrail.clientId,
          apiKey: options.auditTrail.apiKey,
        }
      : undefined,
    requestLogs: {
      enabled: options.requestLogs?.enabled ?? true,
      includeMethods: options.requestLogs?.includeMethods ?? [
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
      ],
      excludePaths: options.requestLogs?.excludePaths ?? [
        "/request-logs",
        "/health",
      ],
      timeoutMs: options.requestLogs?.timeoutMs ?? 3000,
      url: options.requestLogs?.url,
    },
    auditEvents: {
      enabled: options.auditEvents?.enabled ?? true,
      timeoutMs: options.auditEvents?.timeoutMs ?? 5000,
      url: options.auditEvents?.url,
      wildcardConsumer: {
        enabled: options.auditEvents?.wildcardConsumer?.enabled ?? false,
        pattern: options.auditEvents?.wildcardConsumer?.pattern ?? "#",
        queueName: options.auditEvents?.wildcardConsumer?.queueName,
        eventBusToken: options.auditEvents?.wildcardConsumer?.eventBusToken,
      },
    },
  };

  if (
    normalizedOptions.auditEvents?.wildcardConsumer?.enabled &&
    !normalizedOptions.auditEvents?.wildcardConsumer?.eventBusToken
  ) {
    throw new Error(
      "ObservabilityModule requires auditEvents.wildcardConsumer.eventBusToken when the wildcard consumer is enabled",
    );
  }

  return normalizedOptions;
}

function composeRequestLogErrorMapper(
  fallbackMapper: DefaultRequestLogErrorMapper,
  customMapper?: ObservabilityModuleOptions["requestLogErrorMapper"],
) {
  if (!customMapper) {
    return fallbackMapper;
  }

  return {
    async map(error: unknown, params: { request: any }) {
      const customResult = await customMapper.map(error, params);
      return customResult ?? fallbackMapper.map(error);
    },
  };
}

function composeAuditMapper(
  fallbackMapper: DefaultAuditMapper,
  customMapper?: ObservabilityModuleOptions["auditMapper"],
) {
  if (!customMapper) {
    return fallbackMapper;
  }

  return {
    resolveEventName: customMapper.resolveEventName?.bind(customMapper) ?? fallbackMapper.resolveEventName.bind(fallbackMapper),
    resolveAction: customMapper.resolveAction?.bind(customMapper) ?? fallbackMapper.resolveAction.bind(fallbackMapper),
    resolveResource: customMapper.resolveResource?.bind(customMapper) ?? fallbackMapper.resolveResource.bind(fallbackMapper),
    resolveActor: customMapper.resolveActor?.bind(customMapper) ?? fallbackMapper.resolveActor.bind(fallbackMapper),
    resolveMetadata: customMapper.resolveMetadata?.bind(customMapper) ?? fallbackMapper.resolveMetadata.bind(fallbackMapper),
    resolveOccurredAt: customMapper.resolveOccurredAt?.bind(customMapper) ?? fallbackMapper.resolveOccurredAt.bind(fallbackMapper),
  };
}
