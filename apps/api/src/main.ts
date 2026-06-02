import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { corsOrigins, loadEnv } from '@chista/config';
import { AppModule } from './app.module';

// Prisma returns BigInt for some columns (e.g. Recording.bytes). JSON.stringify
// throws on BigInt by default, which would 500 any endpoint that returns one.
// Serialize BigInt as a JSON number string so responses stay valid.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: corsOrigins(env), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Chista API')
    .setDescription('Control plane for the Chista container-streaming platform.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.API_PORT);
  new Logger('Bootstrap').log(`Chista API listening on :${env.API_PORT} — docs at /api/docs`);
}

void bootstrap();
