import { Controller, Get, Inject } from "@nestjs/common";
import { REDIS_PUBLISHER } from "../../config/redis.module";
import Redis from "ioredis";

@Controller("health")
export class HealthController {
  constructor(@Inject(REDIS_PUBLISHER) private readonly redis: Redis) {}

  @Get()
  check() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("redis")
  async redisHealth() {
    try {
      const pong = await this.redis.ping();
      return { status: "ok", redis: pong };
    } catch (err) {
      return { status: "error", message: (err as Error).message };
    }
  }
}
