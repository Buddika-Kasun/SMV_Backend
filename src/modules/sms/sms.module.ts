import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { SecurityModule } from '../../common/security.module';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}