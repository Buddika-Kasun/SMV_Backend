import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { SecurityModule } from '../../common/security.module';
import { SmsModule } from '../sms/sms.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  imports: [PrismaModule, SecurityModule, SmsModule],
  controllers: [LoansController],
  providers: [LoansService],
})
export class LoansModule {}