import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationListenerService } from "./notification-listener.service";
import { PrismaService } from "../../config/prisma.service";
import { EventsModule } from "../event/events.module";
import { SecurityModule } from "../../common/security.module";

@Module({
  controllers: [NotificationsController],
  imports: [EventsModule, SecurityModule],
  providers: [NotificationsService, NotificationListenerService, PrismaService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
