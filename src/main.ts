import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { config } from './config/env';

/**
 * Application entry point. Global prefix is /api so routes match the
 * documented contracts (e.g. POST /api/auth/login).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });

  // Mount all controllers under /api.
  app.setGlobalPrefix('api');

  // DTO validation and transformation for all request bodies/query params.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
    }),
  );

  const logger = new Logger('Bootstrap');
  try {
    await app.listen(config.port);
    logger.log(`SMV Holdings backend listening on http://localhost:${config.port}/api`);
  } catch (err) {
    logger.error(`Startup failed: ${err instanceof Error ? err.message : String(err)}`);
    await app.close();
    process.exit(1);
  }
}

bootstrap();