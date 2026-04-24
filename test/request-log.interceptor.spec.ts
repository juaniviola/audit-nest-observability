import { BadRequestException } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";

import { RequestContextService } from "@lib/context/request-context.service";
import { PublishRequestLogService } from "@lib/http/application/publish-request-log.service";
import { RequestLogInterceptor } from "@lib/http/infrastructure/request-log.interceptor";
import { DefaultPayloadSanitizer } from "@lib/shared/default-payload-sanitizer";
import { DefaultRequestLogErrorMapper } from "@lib/shared/default-request-log-error.mapper";
import {
  ObservabilityModuleOptions,
  ObservabilityRequestLogErrorMapper,
} from "@lib/shared/observability.types";


const flushAsyncSideEffects = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
};

describe("RequestLogInterceptor", () => {
  const options: ObservabilityModuleOptions = {
    sourceApp: "orders-api",
    sourceEnv: "production",
    requestLogs: {
      enabled: true,
      url: "http://localhost:5000/v1/request-logs",
      includeMethods: ["POST", "PUT", "PATCH", "DELETE"],
      excludePaths: ["/request-logs"],
    },
    auditEvents: { enabled: false },
    actorResolver: {
      resolveFromHttp: (request: any) => ({
        actorType: request.userId ? "user" : "anonymous",
        actorId: request.userId,
        actorLabel: request.clientRut,
      }),
    },
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-22T14:05:22.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("logs only side-effect requests and redacts sensitive request data", async () => {
    const requestContextService = new RequestContextService();
    const publishRequestLogService = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as PublishRequestLogService;
    const interceptor = new RequestLogInterceptor(
      options,
      new DefaultPayloadSanitizer(),
      options.actorResolver!,
      new DefaultRequestLogErrorMapper(),
      requestContextService,
      publishRequestLogService,
    );

    const request = {
      method: "POST",
      originalUrl: "/v1/orders?idempotencyKey=abc-123",
      url: "/v1/orders?idempotencyKey=abc-123",
      baseUrl: "/v1/orders",
      route: { path: "/" },
      body: { amount: 1500, password: "secret" },
      query: { idempotencyKey: "abc-123" },
      userId: "user-1",
      clientRut: "11.111.111-1",
    };

    await requestContextService.run(
      {
        requestId: "req-1",
        correlationId: "corr-1",
        ip: "203.0.113.42",
        userAgent: "Mozilla/5.0",
        actorType: "user",
        actorId: "user-1",
        actorLabel: "11.111.111-1",
      },
      async () => {
        await lastValueFrom(
          interceptor.intercept(
            {
              switchToHttp: () => ({
                getRequest: () => request,
                getResponse: () => ({ statusCode: 201 }),
              }),
            } as any,
            { handle: () => of({ ok: true }) },
          ),
        );
      },
    );

    expect(publishRequestLogService.publish as jest.Mock).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/orders?idempotencyKey=abc-123",
      route: "/v1/orders/",
      status: 201,
      durationMs: 0,
      actorType: "user",
      actorId: "user-1",
      actorLabel: "11.111.111-1",
      requestId: "req-1",
      correlationId: "corr-1",
      ip: "203.0.113.42",
      userAgent: "Mozilla/5.0",
      requestBody: { amount: 1500, password: "[REDACTED]" },
      query: { idempotencyKey: "abc-123" },
      occurredAt: "2026-04-22T14:05:22.000Z",
    });
  });

  it("rethrows controller errors while still emitting a request log", async () => {
    const requestContextService = new RequestContextService();
    const publishRequestLogService = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as PublishRequestLogService;
    const interceptor = new RequestLogInterceptor(
      options,
      new DefaultPayloadSanitizer(),
      options.actorResolver!,
      new DefaultRequestLogErrorMapper(),
      requestContextService,
      publishRequestLogService,
    );

    await expect(
      lastValueFrom(
        interceptor.intercept(
          {
            switchToHttp: () => ({
              getRequest: () => ({
                method: "POST",
                url: "/v1/orders",
                originalUrl: "/v1/orders",
                body: {},
                query: {},
              }),
              getResponse: () => ({ statusCode: 201 }),
            }),
          } as any,
          {
            handle: () =>
              throwError(() => new BadRequestException("Invalid amount")),
          },
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await flushAsyncSideEffects();

    expect(publishRequestLogService.publish as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        errorCode: "BadRequestException",
        errorMessage: "Invalid amount",
      }),
    );
  });

  it("supports custom request log error mappers for app-specific errors", async () => {
    class DomainLikeError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "DomainLikeError";
      }
    }

    const requestContextService = new RequestContextService();
    const publishRequestLogService = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as PublishRequestLogService;
    const errorMapper: ObservabilityRequestLogErrorMapper = {
      map: jest.fn().mockImplementation((error) => {
        if (error instanceof DomainLikeError) {
          return {
            status: 409,
            errorCode: "DOMAIN_CONFLICT",
            errorMessage: error.message,
            responseBody: { message: error.message, token: "secret-token" },
          };
        }

        return undefined;
      }),
    };
    const interceptor = new RequestLogInterceptor(
      options,
      new DefaultPayloadSanitizer(),
      options.actorResolver!,
      errorMapper,
      requestContextService,
      publishRequestLogService,
    );

    await expect(
      lastValueFrom(
        interceptor.intercept(
          {
            switchToHttp: () => ({
              getRequest: () => ({
                method: "PATCH",
                url: "/v1/orders/order-1",
                originalUrl: "/v1/orders/order-1",
                body: {},
                query: {},
              }),
              getResponse: () => ({ statusCode: 200 }),
            }),
          } as any,
          {
            handle: () => throwError(() => new DomainLikeError("Duplicate")),
          },
        ),
      ),
    ).rejects.toBeInstanceOf(DomainLikeError);

    await flushAsyncSideEffects();

    expect(errorMapper.map).toHaveBeenCalled();
    expect(publishRequestLogService.publish as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 409,
        errorCode: "DOMAIN_CONFLICT",
        errorMessage: "Duplicate",
        responseBody: { message: "Duplicate", token: "[REDACTED]" },
      }),
    );
  });
});
