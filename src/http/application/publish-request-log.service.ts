import { Inject, Injectable, Logger } from "@nestjs/common";

import { OBSERVABILITY_REQUEST_LOGS_REPOSITORY } from "../../shared/observability.constants";
import { RequestLogsRepository } from "../../shared/observability.types";
import { RequestLog } from "../domain/request-log";

@Injectable()
export class PublishRequestLogService {
  private readonly logger = new Logger(PublishRequestLogService.name);

  constructor(
    @Inject(OBSERVABILITY_REQUEST_LOGS_REPOSITORY)
    private readonly requestLogsRepository: RequestLogsRepository,
  ) {}

  async publish(requestLog: RequestLog): Promise<void> {
    try {
      await this.requestLogsRepository.publish(requestLog);
    } catch (error) {
      this.logger.error(
        `Error publishing request log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
