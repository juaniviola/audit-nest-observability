import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "async_hooks";

import { RequestContext } from "../shared/observability.types";

type RequestContextStore = {
  context: RequestContext;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  run<T>(context: Partial<RequestContext>, callback: () => T): T {
    return this.storage.run({ context: this.clean(context) }, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore()?.context;
  }

  set(context: Partial<RequestContext>): void {
    const store = this.storage.getStore();

    if (!store) {
      return;
    }

    store.context = this.clean({ ...store.context, ...context });
  }

  snapshot(): RequestContext | undefined {
    const context = this.get();
    return context ? { ...context } : undefined;
  }

  private clean(context: Partial<RequestContext>): RequestContext {
    return Object.fromEntries(
      Object.entries(context).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    ) as RequestContext;
  }
}
