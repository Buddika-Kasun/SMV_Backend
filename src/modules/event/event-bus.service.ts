import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { filter, map } from "rxjs/operators";
import { Redis } from "ioredis";
import { REDIS_PUBLISHER, REDIS_SUBSCRIBER } from "../../config/redis.module";

const CHANNEL = "smv:events";

export type AppEventType =
  | "loans.changed"
  | "payment.recorded"
  | "stats.changed"
  | "notification.created"
  | "notifications.changed"
  | "users.changed";

export interface AppEvent {
  type: AppEventType;
  payload: Record<string, any>;
  timestamp: string;
  /** If set, only this user receives the event over SSE. */
  userId?: string;
  /** If set, only users with one of these roles receive the event over SSE. */
  roles?: string[];
}

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);

  /** Local fan-out — one Subject per instance, fed from Redis. */
  private readonly events$ = new Subject<AppEvent>();

  constructor(
    @Inject(REDIS_PUBLISHER) private readonly publisher: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber.on("message", (channel: string, message: string) => {
      if (channel !== CHANNEL) return;

      try {
        const event: AppEvent = JSON.parse(message);

        this.logger.debug?.(
          `received: type=${event.type} action=${event.payload?.action ?? "-"} userId=${event.userId ?? "-"}`,
        );

        this.events$.next(event);
      } catch (err) {
        this.logger.error(
          `Failed to parse event from Redis: ${message.slice(0, 200)}`,
        );
      }
    });

    await this.subscriber.subscribe(CHANNEL);
    this.logger.log(`Subscribed to Redis channel "${CHANNEL}"`);
  }

  async onModuleDestroy(): Promise<void> {
    this.events$.complete();
    // Subscriber cleanup happens in RedisModule.onModuleDestroy
  }

  /**
   * Raw event stream — for internal subscribers (notification listener, etc.)
   * Unlike `subscribe()`, this returns the full AppEvent (no SSE wrapping,
   * no per-user filtering).
   */
  onEvent(): Observable<AppEvent> {
    return this.events$.asObservable();
  }

  /**
   * Publish an event to Redis. Every backend instance subscribed to the
   * channel receives it, including this one.
   *
   * Always call AFTER a DB transaction commits — never inside it.
   */
  async publish(event: Omit<AppEvent, "timestamp">): Promise<void> {
    const full: AppEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.logger.debug?.(
      `publish: type=${full.type} action=${full.payload?.action ?? "-"} targetUser=${full.userId ?? full.payload?.userId ?? "-"}`,
    );

    try {
      await this.publisher.publish(CHANNEL, JSON.stringify(full));
    } catch (err) {
      // Never let a Redis hiccup break the API response.
      this.logger.error(
        `Failed to publish event "${event.type}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Returns an Observable suitable for `@Sse()`.
   *
   * Filters by user and role. Events with no `userId` and no `roles` are
   * broadcast to every connected client (e.g. `stats.changed`).
   */
  subscribe(userId?: string, roles?: string[]): Observable<{ data: string }> {
    return this.events$.pipe(
      filter((event) => {
        // If the event targets a specific user, only deliver to them.
        if (event.userId && event.userId !== userId) return false;

        // If the event targets specific roles, only deliver to matching roles.
        if (
          event.roles &&
          (!roles || !event.roles.some((r) => roles.includes(r)))
        ) {
          return false;
        }

        return true;
      }),
      map((event) => ({
        // No `type` field — named SSE events bypass `onmessage` in the
        // browser. All events go through `onmessage` and are dispatched by
        // the JSON `type` inside the payload.
        data: JSON.stringify(event),
      })),
    );
  }
}
