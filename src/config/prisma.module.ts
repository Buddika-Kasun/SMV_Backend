import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';

/**
 * Global module exposing the Prisma client and the object-storage service for
 * injection into any feature module.
 */
@Global()
@Module({
  providers: [PrismaService, StorageService],
  exports: [PrismaService, StorageService],
})
export class PrismaModule {}