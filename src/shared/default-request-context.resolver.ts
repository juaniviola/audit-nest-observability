import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Request } from "express";

import {
  ObservabilityRequestContextResolver,
  RequestContext,
} from "./observability.types";

@Injectable()
export class DefaultRequestContextResolver
  implements ObservabilityRequestContextResolver
{
  async resolve(request: Request): Promise<Partial<RequestContext>> {
    const requestId = this.header(request, "x-request-id") ?? randomUUID();
    const correlationId = this.header(request, "x-correlation-id") ?? requestId;

    return {
      requestId,
      correlationId,
      ip:
        this.header(request, "x-forwarded-for")?.split(",")[0]?.trim() ??
        this.header(request, "x-real-ip") ??
        request.ip,
      userAgent: this.header(request, "user-agent"),
      referer: this.header(request, "referer"),
      origin: this.header(request, "origin"),
      method: request.method?.toUpperCase(),
      path: request.originalUrl ?? request.url,
      route: this.resolveRoute(request),
    };
  }

  private resolveRoute(request: Request): string | undefined {
    const routePath = request.route?.path;

    if (typeof routePath !== "string") {
      return undefined;
    }

    const baseUrl = request.baseUrl ?? "";
    return `${baseUrl}${routePath}`;
  }

  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name.toLowerCase()];

    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }
}
