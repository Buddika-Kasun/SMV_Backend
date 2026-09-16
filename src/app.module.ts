import { Module } from '@nestjs/common';
import { PrismaModule } from './config/prisma.module';
import { SecurityModule } from './common/security.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LoansModule } from './modules/loan/loans.module';
import { ConsultancyModule } from './modules/consultancy/consultancy.module';
import { SmsModule } from './modules/sms/sms.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PaginationModule } from './common/pagination.module';
import { CustomersModule } from './modules/customer/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthController } from './modules/health/health.controller';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PaginationModule,
    PrismaModule,
    SecurityModule,
    AuthModule,
    UsersModule,
    LoansModule,
    CustomersModule,
    ConsultancyModule,
    SmsModule,
    ReportsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}