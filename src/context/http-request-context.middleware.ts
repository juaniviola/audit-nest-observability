import { Inject, Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

import {
  OBSERVABILITY_ACTOR_RESOLVER,
  OBSERVABILITY_REQUEST_CONTEXT_RESOLVER,
} from "../shared/observability.constants";
import {
  ObservabilityActorResolver,
  ObservabilityRequestContextResolver,
} from "../shared/observability.types";
import { RequestContextService } from "./request-context.service";

@Injectable()
export class HttpRequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContextService: RequestContextService,
    @Inject(OBSERVABILITY_REQUEST_CONTEXT_RESOLVER)
    private readonly requestContextResolver: ObservabilityRequestContextResolver,
    @Inject(OBSERVABILITY_ACTOR_RESOLVER)
    private readonly actorResolver: ObservabilityActorResolver,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const baseContext = await this.requestContextResolver.resolve(req);
    const actorContext = await this.actorResolver.resolveFromHttp(req);

    this.requestContextService.run({ ...baseContext, ...actorContext }, next);
  }
}
