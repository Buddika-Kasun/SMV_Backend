import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { PrismaModule } from "../../config/prisma.module";
import { SecurityModule } from "../../common/security.module";

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
