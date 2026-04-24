import { ConsumerContextRunnerService } from "@lib/events/consumer-context-runner.service";
import { EventContextPropagatorService } from "@lib/events/event-context-propagator.service";
import { RabbitMqEventContextAdapterService } from "@lib/events/rabbitmq-event-context-adapter.service";
import { RequestContextService } from "@lib/context/request-context.service";

describe("RabbitMqEventContextAdapterService", () => {
  it("builds RabbitMQ publish options and extracts metadata from consumed messages", () => {
    const requestContextService = new RequestContextService();
    const propagator = new EventContextPropagatorService(requestContextService);
    const runner = new ConsumerContextRunnerService(
      requestContextService,
      propagator,
    );
    const adapter = new RabbitMqEventContextAdapterService(propagator, runner);

    requestContextService.run(
      { requestId: "req-1", correlationId: "corr-1", actorId: "user-1" },
      () => {
        const publishOptions = adapter.createPublishOptions({
          persistent: true,
          headers: { existing: true },
        });

        expect(publishOptions).toEqual({
          persistent: true,
          headers: {
            existing: true,
            auditContext: {
              requestId: "req-1",
              correlationId: "corr-1",
              actorId: "user-1",
            },
            "x-observability-context": JSON.stringify({
              requestId: "req-1",
              correlationId: "corr-1",
              actorId: "user-1",
            }),
          },
        });

        const metadata = adapter.toEventMetadata({
          fields: { routingKey: "reservation.created" },
          properties: { headers: publishOptions.headers },
        });

        expect(metadata).toEqual({
          routingKey: "reservation.created",
          headers: publishOptions.headers,
          auditContext: {
            requestId: "req-1",
            correlationId: "corr-1",
            actorId: "user-1",
          },
          requestContext: {
            requestId: "req-1",
            correlationId: "corr-1",
            actorId: "user-1",
          },
        });
      },
    );
  });

  it("rehydrates the request context while handling a RabbitMQ message", () => {
    const requestContextService = new RequestContextService();
    const propagator = new EventContextPropagatorService(requestContextService);
    const runner = new ConsumerContextRunnerService(
      requestContextService,
      propagator,
    );
    const adapter = new RabbitMqEventContextAdapterService(propagator, runner);

    const result = adapter.runWithMessage(
      {
        fields: { routingKey: "reservation.created" },
        properties: {
          headers: {
            auditContext: {
              actorType: "user",
              actorId: "user-1",
              actorLabel: "11.111.111-1",
            },
          },
        },
      },
      () => requestContextService.get(),
    );

    expect(result).toEqual({
      actorType: "user",
      actorId: "user-1",
      actorLabel: "11.111.111-1",
    });
  });
});
