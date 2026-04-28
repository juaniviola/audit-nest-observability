import { Inject, Injectable } from "@nestjs/common";
import axios from "axios";

import { OBSERVABILITY_OPTIONS } from "../../shared/observability.constants";
import { createAuditTrailJsonHeaders } from "../../shared/audit-trail-signature";
import {
  ObservabilityModuleOptions,
  RequestLogsRepository,
} from "../../shared/observability.types";
import { RequestLog } from "../domain/request-log";

@Injectable()
export class HttpRequestLogsRepository implements RequestLogsRepository {
  constructor(
    @Inject(OBSERVABILITY_OPTIONS)
    private readonly options: ObservabilityModuleOptions,
  ) {}

  async publish(requestLog: RequestLog): Promise<void> {
    const config = this.options.requestLogs;

    if (config?.enabled === false || !config?.url) {
      return;
    }

    const body = JSON.stringify({
      sourceApp: this.options.sourceApp,
      sourceEnv: this.options.sourceEnv,
      ...requestLog,
    });

    await axios.post(config.url, body, {
      timeout: config.timeoutMs ?? 3000,
      headers: createAuditTrailJsonHeaders({
        options: this.options,
        method: "POST",
        url: config.url,
        body,
      }),
    });
  }
}
