import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import { ConsumerContextRunnerService } from "../../events/consumer-context-runner.service";
import { OBSERVABILITY_OPTIONS } from "../../shared/observability.constants";
import {
  EventMetadata,
  EventPayload,
  ObservabilityEventBus,
  ObservabilityModuleOptions,
} from "../../shared/observability.types";
import { PublishDomainEventAuditService } from "../application/publish-domain-event-audit.service";

@Injectable()
export class AuditWildcardConsumerHandler {
  constructor(
    private readonly consumerContextRunner: ConsumerContextRunnerService,
    private readonly publishDomainEventAuditService: PublishDomainEventAuditService,
  ) {}

  async handle(
    domainEvent: EventPayload,
    metadata?: EventMetadata,
  ): Promise<void> {
    await this.consumerContextRunner.runWithMetadata(metadata, async () => {
      await this.publishDomainEventAuditService.publish(domainEvent, metadata);
    });
  }
}

@Injectable()
export class AuditWildcardConsumer implements OnModuleInit {
  constructor(
    @Inject(OBSERVABILITY_OPTIONS)
    private readonly options: ObservabilityModuleOptions,
    private readonly moduleRef: ModuleRef,
    private readonly handler: AuditWildcardConsumerHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    const wildcardConsumer = this.options.auditEvents?.wildcardConsumer;

    if (!wildcardConsumer?.enabled) {
      return;
    }

    if (!wildcardConsumer.eventBusToken) {
      throw new Error(
        "Observability wildcard consumer requires auditEvents.wildcardConsumer.eventBusToken",
      );
    }

    const eventBus = this.moduleRef.get<ObservabilityEventBus>(
      wildcardConsumer.eventBusToken,
      { strict: false },
    );

    if (!eventBus) {
      throw new Error(
        "Observability wildcard consumer could not resolve the configured event bus provider",
      );
    }

    await eventBus.register(
      wildcardConsumer.pattern ?? "#",
      (payload, metadata) => this.handler.handle(payload, metadata),
      wildcardConsumer.queueName,
    );
  }
}
