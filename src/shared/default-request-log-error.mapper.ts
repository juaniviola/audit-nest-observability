import { HttpException, Injectable } from "@nestjs/common";

import {
  ObservabilityRequestLogErrorMapper,
  RequestLogErrorDetails,
} from "./observability.types";

@Injectable()
export class DefaultRequestLogErrorMapper
  implements ObservabilityRequestLogErrorMapper
{
  map(error: unknown): Partial<RequestLogErrorDetails> | undefined {
    if (error instanceof HttpException) {
      return {
        status: error.getStatus(),
        errorCode: error.name,
        errorMessage: error.message,
        responseBody: error.getResponse(),
      };
    }

    return {
      status: 500,
      errorCode: "INTERNAL_ERROR",
      errorMessage:
        error instanceof Error ? error.message : "Unhandled downstream failure",
      responseBody: { error: "Internal server error" },
    };
  }
}
