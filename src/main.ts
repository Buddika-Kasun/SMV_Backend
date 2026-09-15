import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { config, validateEnvironment, logConfigSummary } from "./config/env";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { PrismaService } from "./config/prisma.service";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  // 👇 1. Validate env FIRST — exit early if broken
  try {
    validateEnvironment();
    logConfigSummary();
  } catch (err) {
    logger.error(err instanceof Error ? err.message : "Env validation failed");
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
  });

  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
    }),
  );

  // 👇 2. Verify DB connection BEFORE accepting traffic
  const prisma = app.get(PrismaService);
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.log("✅ Database connection established");
  } catch (err) {
    logger.error(
      `❌ Database connection failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    await app.close();
    process.exit(1);
  }

  // 👇 3. Graceful shutdown — close Prisma pool on SIGTERM/SIGINT
  app.enableShutdownHooks();

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle("SMV Holdings API")
    .setDescription("SMV Holdings Microfinance & Fund Management Platform API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  try {
    await app.listen(config.port);
    logger.log(
      `🚀 SMV Holdings backend listening on http://localhost:${config.port}/api`,
    );
    logger.log(
      `📚 Swagger documentation: http://localhost:${config.port}/api/docs`,
    );
  } catch (err) {
    logger.error(
      `Startup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    await app.close();
    process.exit(1);
  }
}

bootstrap();
