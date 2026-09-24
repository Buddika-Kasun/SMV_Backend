import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { config } from "./env";

export const REDIS_PUBLISHER = "REDIS_PUBLISHER";
export const REDIS_SUBSCRIBER = "REDIS_SUBSCRIBER";

function buildRedisClient(name: string): Redis {
  const url = new URL(config.redis.url);

  const client = new Redis({
    host: url.hostname,
    port: Number(url.port) || 6379,
    username: url.username || undefined,
    password: url.password || undefined,

    // Railway private networking can be IPv6-only — family:0 allows both
    family: 0,

    // Required for pub/sub connections — don't fail commands on retry
    maxRetriesPerRequest: null,

    // Reconnect strategy — capped backoff
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },

    lazyConnect: false,
  });

  client.on("connect", () => {
    // Silent — happens on every reconnect, don't spam logs
  });

  client.on("error", (err) => {
    console.error(`[Redis:${name}] error:`, err.message);
  });

  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_PUBLISHER,
      useFactory: () => buildRedisClient("publisher"),
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: () => buildRedisClient("subscriber"),
    },
  ],
  exports: [REDIS_PUBLISHER, REDIS_SUBSCRIBER],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_PUBLISHER) private readonly publisher: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleDestroy() {
    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
  }
}
