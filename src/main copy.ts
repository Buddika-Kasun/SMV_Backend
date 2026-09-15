import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { config } from "./config/env";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });

  // Mount all controllers under /api
  app.setGlobalPrefix("api");

  // DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
    }),
  );

  // ===== SWAGGER CONFIGURATION =====
  const swaggerConfig = new DocumentBuilder()
    .setTitle("SMV Holdings API")
    .setDescription("SMV Holdings Microfinance & Fund Management Platform API")
    .setVersion("1.0")
    .addBearerAuth() // If using JWT authentication
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document); // Visit http://localhost:5000/api/docs
  // =================================

  const logger = new Logger("Bootstrap");
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
