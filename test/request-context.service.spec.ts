import { RequestContextService } from "@lib/context/request-context.service";

describe("RequestContextService", () => {
  it("stores request context across async boundaries and supports enrichment", async () => {
    const service = new RequestContextService();

    await service.run(
      { requestId: "req-1", actorType: "anonymous" },
      async () => {
        await Promise.resolve();
        service.set({
          actorType: "user",
          actorId: "user-1",
          actorLabel: "jane.doe@example.com",
        });

        expect(service.get()).toEqual({
          requestId: "req-1",
          actorType: "user",
          actorId: "user-1",
          actorLabel: "jane.doe@example.com",
        });
      },
    );
  });

  it("returns undefined outside a context boundary", () => {
    const service = new RequestContextService();
    expect(service.get()).toBeUndefined();
  });
});
