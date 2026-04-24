import { Test } from "@nestjs/testing";

import { PublishDomainEventAuditService } from "@lib/audit/application/publish-domain-event-audit.service";
import {
  AuditWildcardConsumer,
  AuditWildcardConsumerHandler,
} from "@lib/audit/infrastructure/audit-wildcard-consumer";
import { RequestContextService } from "@lib/context/request-context.service";
import { ConsumerContextRunnerService } from "@lib/events/consumer-context-runner.service";
import { RabbitMqEventContextAdapterService } from "@lib/events/rabbitmq-event-context-adapter.service";
import { ObservabilityModule } from "@lib/observability.module";

describe("ObservabilityModule", () => {
  it("registers the core reusable services", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ObservabilityModule.forRoot({
          sourceApp: "orders-api",
          sourceEnv: "production",
          requestLogs: {
            enabled: true,
            url: "http://localhost:5000/v1/request-logs",
          },
          auditEvents: {
            enabled: true,
            url: "http://localhost:5000/v1/audit-events",
          },
        }),
      ],
    }).compile();

    expect(moduleRef.get(RequestContextService)).toBeInstanceOf(
      RequestContextService,
    );
    expect(moduleRef.get(ConsumerContextRunnerService)).toBeInstanceOf(
      ConsumerContextRunnerService,
    );
    expect(moduleRef.get(PublishDomainEventAuditService)).toBeInstanceOf(
      PublishDomainEventAuditService,
    );
    expect(moduleRef.get(RabbitMqEventContextAdapterService)).toBeInstanceOf(
      RabbitMqEventContextAdapterService,
    );
    expect(moduleRef.get(AuditWildcardConsumerHandler)).toBeInstanceOf(
      AuditWildcardConsumerHandler,
    );
    expect(moduleRef.get(AuditWildcardConsumer)).toBeInstanceOf(
      AuditWildcardConsumer,
    );
  });
});
