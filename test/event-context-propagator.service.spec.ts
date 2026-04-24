import { RequestContextService } from "@lib/context/request-context.service";
import { EventContextPropagatorService } from "@lib/events/event-context-propagator.service";
import { OBSERVABILITY_CONTEXT_HEADER } from "@lib/shared/observability.constants";

describe("EventContextPropagatorService", () => {
  it("serializes and extracts propagated request context through compatibility headers", () => {
    const requestContextService = new RequestContextService();
    const propagator = new EventContextPropagatorService(requestContextService);

    requestContextService.run(
      { requestId: "req-1", correlationId: "corr-1", actorId: "user-1" },
      () => {
        const headers = propagator.createHeaders({ existing: true });

        expect(headers).toEqual({
          existing: true,
          auditContext: {
            requestId: "req-1",
            correlationId: "corr-1",
            actorId: "user-1",
          },
          [OBSERVABILITY_CONTEXT_HEADER]: JSON.stringify({
            requestId: "req-1",
            correlationId: "corr-1",
            actorId: "user-1",
          }),
        });

        expect(propagator.extract({ headers })).toEqual({
          requestId: "req-1",
          correlationId: "corr-1",
          actorId: "user-1",
        });
      },
    );
  });
});
