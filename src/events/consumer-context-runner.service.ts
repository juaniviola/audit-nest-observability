import { Injectable } from "@nestjs/common";

import { RequestContextService } from "../context/request-context.service";
import { EventMetadata } from "../shared/observability.types";
import { EventContextPropagatorService } from "./event-context-propagator.service";

@Injectable()
export class ConsumerContextRunnerService {
  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly eventContextPropagator: EventContextPropagatorService,
  ) {}

  runWithMetadata<T>(
    metadata: EventMetadata | undefined,
    callback: () => T,
  ): T {
    const propagatedContext =
      this.eventContextPropagator.extract(metadata) ?? {};
    return this.requestContextService.run(propagatedContext, callback);
  }
}
