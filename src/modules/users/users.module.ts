import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { SecurityModule } from '../../common/security.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}