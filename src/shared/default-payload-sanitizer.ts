import { Injectable } from "@nestjs/common";

import { ObservabilityPayloadSanitizer } from "./observability.types";

@Injectable()
export class DefaultPayloadSanitizer implements ObservabilityPayloadSanitizer {
  private readonly sensitiveKeys = new Set([
    "authorization",
    "apikey",
    "api_key",
    "api-secret",
    "api_secret",
    "access_token",
    "accesstoken",
    "refresh_token",
    "refreshtoken",
    "password",
    "pass",
    "secret",
    "token",
  ]);

  sanitize(value: unknown): unknown {
    if (value === undefined || value === null) {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      return "[Buffer]";
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(
          ([key, nestedValue]) => [
            key,
            this.isSensitive(key) ? "[REDACTED]" : this.sanitize(nestedValue),
          ],
        ),
      );
    }

    return value;
  }

  private isSensitive(key: string): boolean {
    const normalizedKey = key.toLowerCase();
    return Array.from(this.sensitiveKeys).some((candidate) =>
      normalizedKey.includes(candidate),
    );
  }
}
