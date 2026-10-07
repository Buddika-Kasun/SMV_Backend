import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventBusService } from "./event-bus.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { SecurityModule } from "../../common/security.module";

@Module({
  imports: [SecurityModule],
  controllers: [EventsController],
  providers: [EventBusService, JwtAuthGuard],
  exports: [EventBusService],
})
export class EventsModule {}
