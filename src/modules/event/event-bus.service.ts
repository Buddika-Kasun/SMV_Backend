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
  | "users.changed";

export interface AppEvent {
  type: AppEventType;
  payload: Record<string, any>;
  timestamp: string;
  /** If set, only this user receives the event */
  userId?: string;
  /** If set, only users with one of these roles receive the event */
  roles?: string[];
}

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);

  /** Local fan-out — one Subject per instance, fed from Redis */
  private readonly events$ = new Subject<AppEvent>();

  constructor(
    @Inject(REDIS_PUBLISHER) private readonly publisher: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    // Attach the listener BEFORE subscribe() so we don't miss early messages
    this.subscriber.on("message", (channel: string, message: string) => {
      if (channel !== CHANNEL) return;
      try {
        const event: AppEvent = JSON.parse(message);
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
   * Publish an event. Every backend instance subscribed to the Redis
   * channel receives it and forwards to its local SSE clients.
   *
   * Call this AFTER the DB transaction commits — never inside it.
   */
  async publish(event: Omit<AppEvent, "timestamp">): Promise<void> {
    const full: AppEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    try {
      await this.publisher.publish(CHANNEL, JSON.stringify(full));
    } catch (err) {
      // Never let a Redis hiccup break the API response
      this.logger.error(
        `Failed to publish event "${event.type}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Returns an Observable suitable for `@Sse()`. Filters by user and role.
   */
  subscribe(userId?: string, roles?: string[]): Observable<any> {
    return this.events$.pipe(
      filter((event) => {
        // User-targeted event — deliver only to that user
        if (event.userId && event.userId !== userId) return false;

        // Role-targeted event — deliver only to matching roles
        if (
          event.roles &&
          (!roles || !event.roles.some((r) => roles.includes(r)))
        ) {
          return false;
        }

        return true;
      }),
      map((event) => ({
        data: JSON.stringify(event),
        // type: event.type,
      })),
    );
  }
}
