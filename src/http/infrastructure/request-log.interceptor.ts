import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, catchError, tap, throwError } from "rxjs";

import { RequestContextService } from "../../context/request-context.service";
import {
  OBSERVABILITY_ACTOR_RESOLVER,
  OBSERVABILITY_OPTIONS,
  OBSERVABILITY_PAYLOAD_SANITIZER,
  OBSERVABILITY_REQUEST_LOG_ERROR_MAPPER,
} from "../../shared/observability.constants";
import {
  ObservabilityActorResolver,
  ObservabilityModuleOptions,
  ObservabilityPayloadSanitizer,
  ObservabilityRequestLogErrorMapper,
  RequestContext,
  RequestLogErrorDetails,
} from "../../shared/observability.types";
import { isPathExcluded } from "../../shared/observability.utils";
import { PublishRequestLogService } from "../application/publish-request-log.service";
import { RequestLog } from "../domain/request-log";

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  constructor(
    @Inject(OBSERVABILITY_OPTIONS)
    private readonly options: ObservabilityModuleOptions,
    @Inject(OBSERVABILITY_PAYLOAD_SANITIZER)
    private readonly payloadSanitizer: ObservabilityPayloadSanitizer,
    @Inject(OBSERVABILITY_ACTOR_RESOLVER)
    private readonly actorResolver: ObservabilityActorResolver,
    @Inject(OBSERVABILITY_REQUEST_LOG_ERROR_MAPPER)
    private readonly requestLogErrorMapper: ObservabilityRequestLogErrorMapper,
    private readonly requestContextService: RequestContextService,
    private readonly publishRequestLogService: PublishRequestLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Record<string, any>>();
    const response = http.getResponse<Record<string, any>>();

    if (this.shouldSkip(request)) {
      return next.handle();
    }

    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        void this.publish(request, response?.statusCode ?? 200, startedAt);
      }),
      catchError((error) => {
        void this.publish(
          request,
          this.resolveStatus(error, response?.statusCode),
          startedAt,
          error,
        );
        return throwError(() => error);
      }),
    );
  }

  private shouldSkip(request: {
    method?: string;
    originalUrl?: string;
    url?: string;
  }): boolean {
    const methods =
      this.options.requestLogs?.includeMethods?.map((method) =>
        method.toUpperCase(),
      ) ?? [];
    const path = request.originalUrl ?? request.url;

    return (
      !methods.includes((request.method ?? "").toUpperCase()) ||
      isPathExcluded(path, this.options.requestLogs?.excludePaths)
    );
  }

  private async publish(
    request: Record<string, any>,
    status: number,
    startedAt: number,
    error?: unknown,
  ): Promise<void> {
    await this.publishRequestLogService.publish(
      await this.toRequestLog(request, status, startedAt, error),
    );
  }

  private async toRequestLog(
    request: Record<string, any>,
    status: number,
    startedAt: number,
    error?: unknown,
  ): Promise<RequestLog> {
    const context = this.requestContextService.get();
    const actor = await this.resolveActor(request, context);

    return {
      method: String(request.method ?? "").toUpperCase(),
      path: request.originalUrl ?? request.url ?? "/",
      route: this.resolveRoute(request, context),
      status,
      durationMs: Date.now() - startedAt,
      actorType: actor.actorType,
      ...(actor.actorId ? { actorId: actor.actorId } : {}),
      ...(actor.actorLabel ? { actorLabel: actor.actorLabel } : {}),
      ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
      ...(context?.requestId ? { requestId: String(context.requestId) } : {}),
      ...(context?.correlationId
        ? { correlationId: String(context.correlationId) }
        : {}),
      ...(context?.ip ? { ip: String(context.ip) } : {}),
      ...(context?.userAgent ? { userAgent: String(context.userAgent) } : {}),
      ...(context?.referer ? { referer: String(context.referer) } : {}),
      ...(context?.origin ? { origin: String(context.origin) } : {}),
      ...(request.body !== undefined
        ? { requestBody: this.payloadSanitizer.sanitize(request.body) }
        : {}),
      ...(request.query !== undefined
        ? { query: this.payloadSanitizer.sanitize(request.query) }
        : {}),
      ...(error ? await this.mapError(error, request, status) : {}),
      occurredAt: new Date().toISOString(),
    };
  }

  private async resolveActor(
    request: Record<string, any>,
    context?: RequestContext,
  ) {
    if (context?.actorType) {
      return {
        actorType: context.actorType,
        actorId:
          typeof context.actorId === "string" ? context.actorId : undefined,
        actorLabel:
          typeof context.actorLabel === "string"
            ? context.actorLabel
            : undefined,
        organizationId:
          typeof context.organizationId === "string"
            ? context.organizationId
            : undefined,
      };
    }

    const actor = await this.actorResolver.resolveFromHttp(request as any);

    return {
      actorType: actor?.actorType ?? "anonymous",
      actorId: actor?.actorId,
      actorLabel: actor?.actorLabel,
      organizationId: actor?.organizationId,
    };
  }

  private resolveRoute(
    request: Record<string, any>,
    context?: RequestContext,
  ): string {
    if (context?.route && typeof context.route === "string") {
      return context.route;
    }

    return `${request.baseUrl ?? ""}${request.route?.path ?? request.url ?? "/"}`;
  }

  private resolveStatus(_error: unknown, fallbackStatus?: number): number {
    return fallbackStatus && fallbackStatus >= 400 ? fallbackStatus : 500;
  }

  private async mapError(
    error: unknown,
    request: Record<string, any>,
    fallbackStatus: number,
  ): Promise<Partial<RequestLog>> {
    const mapped =
      (await this.requestLogErrorMapper.map(error, { request: request as any })) ??
      {};
    const status = this.toStatusCode(mapped.status, fallbackStatus);

    return {
      status,
      ...(mapped.errorCode ? { errorCode: mapped.errorCode } : {}),
      ...(mapped.errorMessage ? { errorMessage: mapped.errorMessage } : {}),
      ...(mapped.responseBody !== undefined
        ? { responseBody: this.payloadSanitizer.sanitize(mapped.responseBody) }
        : {}),
    };
  }

  private toStatusCode(
    value: RequestLogErrorDetails["status"] | undefined,
    fallback?: number,
  ): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    return fallback && fallback >= 400 ? fallback : 500;
  }
}
