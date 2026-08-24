import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { SecurityModule } from '../../common/security.module';
import { ConsultancyController } from './consultancy.controller';
import { ConsultancyService } from './consultancy.service';

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [ConsultancyController],
  providers: [ConsultancyService],
})
export class ConsultancyModule {}