import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { PrismaModule } from "../../config/prisma.module";
import { SecurityModule } from "../../common/security.module";
import { SmsModule } from "../sms/sms.module";

@Module({
  imports: [PrismaModule, SecurityModule, SmsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
