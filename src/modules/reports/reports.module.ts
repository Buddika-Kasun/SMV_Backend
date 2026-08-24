import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { SecurityModule } from '../../common/security.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}