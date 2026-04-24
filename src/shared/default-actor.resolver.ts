import { Injectable } from "@nestjs/common";
import { Request } from "express";

import { ObservabilityActorResolver } from "./observability.types";

@Injectable()
export class DefaultActorResolver implements ObservabilityActorResolver {
  resolveFromHttp(
    request: Request,
  ): ReturnType<ObservabilityActorResolver["resolveFromHttp"]> {
    const actorId = this.read(request, [
      "userId",
      "user.id",
      "user.sub",
      "clientId",
    ]);

    if (!actorId) {
      return { actorType: "anonymous" };
    }

    return {
      actorType: "user",
      actorId,
      actorLabel:
        this.read(request, ["clientRut", "user.email", "user.username"]) ??
        actorId,
      organizationId: this.read(request, [
        "organizationId",
        "user.organizationId",
      ]),
    };
  }

  private read(source: unknown, paths: string[]): string | undefined {
    for (const path of paths) {
      const value = path.split(".").reduce<unknown>((current, segment) => {
        if (!current || typeof current !== "object") {
          return undefined;
        }

        return (current as Record<string, unknown>)[segment];
      }, source);

      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }

    return undefined;
  }
}
