import { Inject, Injectable } from "@nestjs/common";
import axios from "axios";

import { OBSERVABILITY_OPTIONS } from "../../shared/observability.constants";
import { createAuditTrailJsonHeaders } from "../../shared/audit-trail-signature";
import {
  AuditEventsRepository,
  ObservabilityModuleOptions,
} from "../../shared/observability.types";
import { AuditEvent } from "../domain/audit-event";

@Injectable()
export class HttpAuditEventsRepository implements AuditEventsRepository {
  constructor(
    @Inject(OBSERVABILITY_OPTIONS)
    private readonly options: ObservabilityModuleOptions,
  ) {}

  async publish(auditEvent: AuditEvent): Promise<void> {
    const config = this.options.auditEvents;

    if (config?.enabled === false || !config?.url) {
      return;
    }

    const body = JSON.stringify({
      sourceApp: this.options.sourceApp,
      sourceEnv: this.options.sourceEnv,
      ...auditEvent,
    });

    await axios.post(config.url, body, {
      timeout: config.timeoutMs ?? 5000,
      headers: createAuditTrailJsonHeaders({
        options: this.options,
        method: "POST",
        url: config.url,
        body,
      }),
    });
  }
}
