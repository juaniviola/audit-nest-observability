import crypto from "crypto";
import axios from "axios";

import { HttpAuditEventsRepository } from "@lib/audit/infrastructure/http-audit-events.repository";
import { HttpRequestLogsRepository } from "@lib/http/infrastructure/http-request-logs.repository";
import { ObservabilityModule } from "@lib/observability.module";
import { ObservabilityModuleOptions } from "@lib/shared/observability.types";

jest.mock("axios");

const axiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

describe("signed HTTP publishing", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-27T16:01:02.000Z"));
    axiosPost.mockResolvedValue({ data: undefined });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it("signs audit events with the audit trail headers", async () => {
    const apiKey =
      "19cba2aa4c8054f022735360cf39c8cb239ebd98ce9cceb7f9593a639c91a7a5";
    const repository = new HttpAuditEventsRepository({
      sourceApp: "orders-api",
      sourceEnv: "local",
      auditTrail: {
        clientId: "jviola",
        apiKey,
      },
      auditEvents: {
        enabled: true,
        url: "http://localhost:5000/v1/audit-events",
      },
    } as ObservabilityModuleOptions);

    await repository.publish({
      eventName: "order.created",
      action: "create",
      resourceType: "order",
      resourceId: "order-1",
      actorType: "system",
      metadata: undefined,
      occurredAt: "2026-04-27T16:00:00.000Z",
    });

    const body = JSON.stringify({
      sourceApp: "orders-api",
      sourceEnv: "local",
      eventName: "order.created",
      action: "create",
      resourceType: "order",
      resourceId: "order-1",
      actorType: "system",
      metadata: undefined,
      occurredAt: "2026-04-27T16:00:00.000Z",
    });

    expect(axiosPost).toHaveBeenCalledWith(
      "http://localhost:5000/v1/audit-events",
      body,
      {
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
          "x-audit-trail-client-id": "jviola",
          "x-audit-trail-timestamp": "2026-04-27T16:01:02Z",
          "x-audit-trail-signature": expectedSignature(
            apiKey,
            "POST",
            "/v1/audit-events",
            "2026-04-27T16:01:02Z",
            body,
          ),
        },
      },
    );
  });

  it("signs request logs using the configured request log endpoint path", async () => {
    const apiKey = "request-log-secret";
    const repository = new HttpRequestLogsRepository({
      sourceApp: "orders-api",
      sourceEnv: "local",
      auditTrail: {
        clientId: "jviola",
        apiKey,
      },
      requestLogs: {
        enabled: true,
        url: "http://localhost:5000/v1/request-logs?tenant=local",
      },
    } as ObservabilityModuleOptions);

    await repository.publish({
      method: "POST",
      path: "/orders",
      route: "/orders",
      status: 201,
      durationMs: 12,
      actorType: "user",
      actorId: "user-1",
      occurredAt: "2026-04-27T16:00:00.000Z",
    });

    const body = JSON.stringify({
      sourceApp: "orders-api",
      sourceEnv: "local",
      method: "POST",
      path: "/orders",
      route: "/orders",
      status: 201,
      durationMs: 12,
      actorType: "user",
      actorId: "user-1",
      occurredAt: "2026-04-27T16:00:00.000Z",
    });

    expect(axiosPost).toHaveBeenCalledWith(
      "http://localhost:5000/v1/request-logs?tenant=local",
      body,
      {
        timeout: 3000,
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-audit-trail-client-id": "jviola",
          "x-audit-trail-timestamp": "2026-04-27T16:01:02Z",
          "x-audit-trail-signature": expectedSignature(
            apiKey,
            "POST",
            "/v1/request-logs?tenant=local",
            "2026-04-27T16:01:02Z",
            body,
          ),
        }),
      },
    );
  });

  it("rejects partial audit trail signing configuration", async () => {
    await expect(() =>
      ObservabilityModule.forRoot({
        sourceApp: "orders-api",
        sourceEnv: "local",
        auditTrail: {
          clientId: "jviola",
        },
        requestLogs: { enabled: false },
        auditEvents: { enabled: false },
      } as ObservabilityModuleOptions),
    ).toThrow(
      "ObservabilityModule requires both auditTrail.clientId and auditTrail.apiKey when audit trail signing is configured",
    );
  });
});

function expectedSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  body: string,
): string {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonical = [method, path, timestamp, bodyHash].join("\n");

  return `sha256=${crypto
    .createHmac("sha256", secret)
    .update(canonical)
    .digest("hex")}`;
}
