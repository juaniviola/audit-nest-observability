import { Injectable } from "@nestjs/common";

import {
  OBSERVABILITY_AUDIT_CONTEXT_HEADER,
  OBSERVABILITY_CONTEXT_HEADER,
} from "../shared/observability.constants";
import { EventMetadata, RequestContext } from "../shared/observability.types";
import { RequestContextService } from "../context/request-context.service";

@Injectable()
export class EventContextPropagatorService {
  constructor(private readonly requestContextService: RequestContextService) {}

  createHeaders(
    existingHeaders: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const context = this.requestContextService.snapshot();

    if (!context || Object.keys(context).length === 0) {
      return existingHeaders;
    }

    return {
      ...existingHeaders,
      [OBSERVABILITY_AUDIT_CONTEXT_HEADER]: context,
      [OBSERVABILITY_CONTEXT_HEADER]: JSON.stringify(context),
    };
  }

  extract(
    metadata?: EventMetadata | Record<string, unknown>,
  ): RequestContext | undefined {
    if (!metadata) {
      return undefined;
    }

    if (
      "requestContext" in metadata &&
      metadata.requestContext &&
      typeof metadata.requestContext === "object"
    ) {
      return metadata.requestContext as RequestContext;
    }

    if (
      "auditContext" in metadata &&
      metadata.auditContext &&
      typeof metadata.auditContext === "object"
    ) {
      return metadata.auditContext as RequestContext;
    }

    const headers =
      "headers" in metadata &&
      metadata.headers &&
      typeof metadata.headers === "object"
        ? (metadata.headers as Record<string, unknown>)
        : metadata;

    const normalizedHeaders = headers as Record<string, unknown>;
    const structuredContext =
      normalizedHeaders[OBSERVABILITY_AUDIT_CONTEXT_HEADER];

    if (
      structuredContext &&
      typeof structuredContext === "object" &&
      !Array.isArray(structuredContext)
    ) {
      return structuredContext as RequestContext;
    }

    const serializedContext = normalizedHeaders[OBSERVABILITY_CONTEXT_HEADER];

    if (typeof serializedContext === "string") {
      return this.parse(serializedContext);
    }

    return undefined;
  }

  private parse(serializedContext: string): RequestContext | undefined {
    try {
      return JSON.parse(serializedContext) as RequestContext;
    } catch {
      return undefined;
    }
  }
}
