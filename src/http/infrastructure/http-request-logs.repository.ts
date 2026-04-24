import { Inject, Injectable } from "@nestjs/common";
import axios from "axios";

import { OBSERVABILITY_OPTIONS } from "../../shared/observability.constants";
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

    await axios.post(
      config.url,
      {
        sourceApp: this.options.sourceApp,
        sourceEnv: this.options.sourceEnv,
        ...requestLog,
      },
      { timeout: config.timeoutMs ?? 3000 },
    );
  }
}
