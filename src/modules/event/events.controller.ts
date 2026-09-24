import { Controller, MessageEvent, Req, Sse, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Observable } from "rxjs";
import { Request } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthedUser } from "../../common/guards/auth.types";
import { EventBusService } from "./event-bus.service";

@ApiTags("Events")
@ApiBearerAuth()
@Controller("events")
export class EventsController {
  constructor(private readonly eventBus: EventBusService) {}

  /**
   * Server-Sent Events stream.
   *
   * The token is passed as a query parameter because the browser's native
   * `EventSource` cannot set custom headers (no Authorization header).
   * The JwtAuthGuard reads it from `?token=...` — see the guard changes below.
   */
  @Sse("stream")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "SSE event stream",
    description:
      "Long-lived connection that pushes real-time events: loan changes, payments, stats updates, notifications.",
  })
  stream(@Req() req: Request): Observable<MessageEvent> {
    const user = (req as any).user as AuthedUser;

    // Set headers that prevent proxy buffering — without this, Railway's
    // edge may batch events and clients won't see them until the buffer flushes.
    const res = (req as any).res;
    if (res && typeof res.setHeader === "function") {
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
    }

    return this.eventBus.subscribe(user.sub, [user.role]);
  }
}
