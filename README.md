# audit-nest-observability

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)

Reusable NestJS observability library for apps that need:

- request-scoped context propagation with `AsyncLocalStorage`
- side-effect HTTP request logging via a global interceptor
- domain-event audit publishing via repository contracts
- event metadata/header propagation and consumer-side context rehydration
- RabbitMQ helpers for automatic header injection and metadata extraction
- optional wildcard consumer registration for auditing all domain events

The library follows strict architectural boundaries:

- **domain** defines payloads and contracts
- **application** orchestrates and maps
- **infrastructure** owns transports like HTTP/Axios
- **request context** is the propagated unit across HTTP and events, never the raw Express `Request`

---

## Package structure

```txt
src/
  audit/
    domain/
    application/
    infrastructure/
  http/
    domain/
    application/
    infrastructure/
  context/
  events/
  shared/
  observability.module.ts
```

---

## Installation shape

```ts
import { Module } from "@nestjs/common";
import { ObservabilityModule } from "audit-nest-observability";
import { EventBus } from "src/shared/domain/bus/event/event.bus";

@Module({
  imports: [
    ObservabilityModule.forRoot({
      sourceApp: "orders-api",
      sourceEnv: "production",
      requestLogs: {
        enabled: true,
        url: "http://localhost:5000/v1/request-logs",
        includeMethods: ["POST", "PUT", "PATCH", "DELETE"],
        excludePaths: ["/request-logs", "/health"],
      },
      auditEvents: {
        enabled: true,
        url: "http://localhost:5000/v1/audit-events",
        wildcardConsumer: {
          enabled: true,
          eventBusToken: EventBus,
          pattern: "#",
          queueName: "audit-events.on-any-domain-event",
        },
      },
    }),
  ],
})
export class AppModule {}
```

---

## Custom actor resolution

You can configure how user/client/org information is extracted from the HTTP request.

```ts
ObservabilityModule.forRoot({
  sourceApp: "orders-api",
  sourceEnv: "production",
  requestLogs: { url: "http://localhost:5000/v1/request-logs" },
  auditEvents: { url: "http://localhost:5000/v1/audit-events" },
  actorResolver: {
    resolveFromHttp: (request) => ({
      actorType: request.userId ? "user" : "anonymous",
      actorId: request.userId,
      actorLabel: request.clientRut,
      organizationId: request.organizationId,
    }),
    resolveFromEvent: ({ event }) => ({
      actorId: event.userId as string | undefined,
    }),
  },
});
```

If your auth guard discovers actor data later, enrich the in-flight context:

```ts
constructor(private readonly requestContextService: RequestContextService) {}

this.requestContextService.set({
  actorType: "user",
  actorId: userId,
  actorLabel: clientRut,
  organizationId,
});
```

---

## Request log error mapping

The default mapper handles `HttpException` and a generic `500` fallback.
If your app has domain-specific errors, extend it with `requestLogErrorMapper`.

```ts
ObservabilityModule.forRoot({
  sourceApp: "orders-api",
  sourceEnv: "production",
  requestLogs: { url: "http://localhost:5000/v1/request-logs" },
  auditEvents: { url: "http://localhost:5000/v1/audit-events" },
  requestLogErrorMapper: {
    map: (error) => {
      if (error instanceof DomainError) {
        return {
          status: 409,
          errorCode: "DOMAIN_CONFLICT",
          errorMessage: error.message,
          responseBody: { message: error.message },
        };
      }

      return undefined;
    },
  },
});
```

When a custom mapper returns `undefined`, the library falls back to the default mapper.

---

## Audit mapping extensions

The default audit mapper already covers common heuristics:

- `eventName` from payload or routing key
- action normalization (`created` → `create`, etc.)
- `resourceType` from the event name prefix
- `resourceId` from `aggregateId`, `attributes.id`, nested ids, and recursive fallbacks
- actor lookup from request context, event attributes, nested `userId/clientId`, or recursive fallbacks

You can override only the parts you need:

```ts
ObservabilityModule.forRoot({
  sourceApp: "orders-api",
  sourceEnv: "production",
  requestLogs: { url: "http://localhost:5000/v1/request-logs" },
  auditEvents: { url: "http://localhost:5000/v1/audit-events" },
  auditMapper: {
    resolveAction: () => "upsert",
    resolveResource: ({ event }) => ({
      resourceType: "portfolio",
      resourceId: event.portfolioId as string,
    }),
  },
});
```

Overrides are composed with the default mapper, so unimplemented methods keep the default behavior.

---

## RabbitMQ publishing with propagated context

The library includes a Rabbit helper that injects both compatibility headers:

- `auditContext`
- `x-observability-context`

```ts
constructor(
  private readonly rabbitMqContextAdapter: RabbitMqEventContextAdapterService,
) {}

const publishOptions = this.rabbitMqContextAdapter.createPublishOptions({
  persistent: true,
  headers: { existing: true },
});

channel.publish(exchange, routingKey, payloadBuffer, publishOptions);
```

---

## Consumer-side context rehydration

If you already have your own consumer, restore the propagated request context before calling the audit publisher:

```ts
await this.consumerContextRunner.runWithMetadata(metadata, async () => {
  await this.publishDomainEventAuditService.publish(domainEvent, metadata);
});
```

Or use the Rabbit helper directly:

```ts
await this.rabbitMqContextAdapter.runWithMessage(message, async () => {
  await this.publishDomainEventAuditService.publish(
    JSON.parse(message.content.toString()),
    this.rabbitMqContextAdapter.toEventMetadata(message),
  );
});
```

This recreates a **request context** in memory, not a fake Express request.

---

## Wildcard audit consumer

If your app exposes an event bus with a `register(pattern, handler, queueName?)` contract, the library can auto-register a wildcard consumer:

```ts
auditEvents: {
  enabled: true,
  url: "http://localhost:5000/v1/audit-events",
  wildcardConsumer: {
    enabled: true,
    eventBusToken: EventBus,
    pattern: "#",
    queueName: "audit-events.on-any-domain-event",
  },
}
```

If your app needs custom consumer logic, inject `AuditWildcardConsumerHandler` and call `handle(payload, metadata)` from your own consumer.

---

## Repositories and contracts

### Request logs

- domain payload: `RequestLog`
- contract: `RequestLogsRepository`
- default infrastructure adapter: `HttpRequestLogsRepository`

### Audit events

- domain payload: `AuditEvent`
- contract: `AuditEventsRepository`
- default infrastructure adapter: `HttpAuditEventsRepository`

Override the repository tokens if a given app wants to publish through another mechanism.

---

## Public extension points

- `OBSERVABILITY_REQUEST_LOGS_REPOSITORY`
- `OBSERVABILITY_AUDIT_EVENTS_REPOSITORY`
- `OBSERVABILITY_ACTOR_RESOLVER`
- `OBSERVABILITY_REQUEST_CONTEXT_RESOLVER`
- `OBSERVABILITY_PAYLOAD_SANITIZER`
- `OBSERVABILITY_REQUEST_LOG_ERROR_MAPPER`
- `OBSERVABILITY_AUDIT_MAPPER`

---

## Current state

This version now includes:

- `forRoot` and `forRootAsync`
- ALS request context
- global request-log interceptor
- request-log publisher service + HTTP repository
- domain-event audit publisher service + HTTP repository
- event context propagation helpers
- RabbitMQ publish/consume helpers
- optional wildcard consumer registration
- configurable request-log error mapping
- configurable audit mapping with default fallbacks

A next step could be adding:

- first-class NATS/Kafka adapters
- payload truncation policies
- route decorators like `@SkipRequestLog()`
- pluggable batching/queueing strategies

---

## Contributing

Contributions are welcome through the standard fork + pull request workflow.

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR. It explains
branch naming, conventional commits, local checks, PR expectations, and the
architecture boundaries that changes must preserve.

By participating in the project, you agree to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

---

## License

This project is licensed under the [MIT License](./LICENSE).
