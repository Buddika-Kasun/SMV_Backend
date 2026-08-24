import { Module } from '@nestjs/common';
import { PrismaModule } from './config/prisma.module';
import { SecurityModule } from './common/security.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LoansModule } from './modules/loan/loans.module';
import { ConsultancyModule } from './modules/consultancy/consultancy.module';
import { SmsModule } from './modules/sms/sms.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    PrismaModule,
    SecurityModule,
    AuthModule,
    UsersModule,
    LoansModule,
    ConsultancyModule,
    SmsModule,
    ReportsModule,
  ],
})
export class AppModule {}