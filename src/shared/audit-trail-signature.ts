import crypto from "crypto";

import {
  ObservabilityAuditTrailOptions,
  ObservabilityModuleOptions,
} from "./observability.types";

const AUDIT_TRAIL_SIGNATURE_ALGORITHM = "sha256";

export function createAuditTrailJsonHeaders(params: {
  options: ObservabilityModuleOptions;
  method: string;
  url: string;
  body: string;
}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...createAuditTrailSignatureHeaders({
      auditTrail: params.options.auditTrail,
      method: params.method,
      path: resolveRequestPath(params.url),
      body: params.body,
    }),
  };
}

function createAuditTrailSignatureHeaders(params: {
  auditTrail?: ObservabilityAuditTrailOptions;
  method: string;
  path: string;
  body: string;
}): Record<string, string> {
  if (!params.auditTrail) {
    return {};
  }

  const timestamp = toAuditTrailTimestamp(new Date());
  const bodyHash = crypto
    .createHash(AUDIT_TRAIL_SIGNATURE_ALGORITHM)
    .update(params.body)
    .digest("hex");
  const canonical = [
    params.method.toUpperCase(),
    params.path,
    timestamp,
    bodyHash,
  ].join("\n");
  const signature = crypto
    .createHmac(AUDIT_TRAIL_SIGNATURE_ALGORITHM, params.auditTrail.apiKey ?? "")
    .update(canonical)
    .digest("hex");

  return {
    "x-audit-trail-client-id": params.auditTrail.clientId ?? "",
    "x-audit-trail-timestamp": timestamp,
    "x-audit-trail-signature": `${AUDIT_TRAIL_SIGNATURE_ALGORITHM}=${signature}`,
  };
}

function toAuditTrailTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function resolveRequestPath(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.pathname || "/"}${parsedUrl.search}`;
  } catch {
    return url || "/";
  }
}
