import { Module } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { PrismaService } from "../../config/prisma.service";
import { PaginationService } from "../../common/services/pagination.service";
import { PrismaModule } from "../../config/prisma.module";
import { SecurityModule } from "../../common/security.module";
import { SmsModule } from "../sms/sms.module";

@Module({
  imports: [PrismaModule, SecurityModule, SmsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
