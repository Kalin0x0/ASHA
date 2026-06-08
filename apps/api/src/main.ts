import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { corsOrigins, loadEnv } from '@chista/config';
import { AppModule } from './app.module';
import { DevApiModule } from './modules/dev-api/dev-api.module';

// Prisma returns BigInt for some columns (e.g. Recording.bytes). JSON.stringify
// throws on BigInt by default, which would 500 any endpoint that returns one.
// Serialize BigInt as a JSON number string so responses stay valid.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      // Prevent browsers from sniffing the MIME type
      xContentTypeOptions: true,
      // Block clickjacking — session iframes are served from a different origin
      frameguard: { action: 'deny' },
      // Remove X-Powered-By
      hidePoweredBy: true,
      // Force HTTPS for 1 year (includeSubDomains)
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
      // Disable IE-era XSS filter (modern browsers ignore it; can create new vectors)
      xssFilter: false,
      // CSP is handled at the Next.js edge; here we only restrict the API's own
      // responses (Swagger UI, JSON). Allow 'unsafe-inline' for Swagger UI scripts.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
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

  // Public, SDK-oriented contract: ONLY the API-key Developer API surface, so
  // codegen (openapi-generator etc.) targets the stable public endpoints rather
  // than the internal control plane. JSON served at /api/dev-docs-json.
  const devConfig = new DocumentBuilder()
    .setTitle('Chista Developer API')
    .setDescription('Public, API-key-authenticated developer surface for SDKs and automation.')
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'ApiKey')
    .build();
  const devDocument = SwaggerModule.createDocument(app, devConfig, { include: [DevApiModule] });
  SwaggerModule.setup('api/dev-docs', app, devDocument);

  await app.listen(env.API_PORT);
  new Logger('Bootstrap').log(
    `Chista API listening on :${env.API_PORT} — docs at /api/docs, developer SDK contract at /api/dev-docs`,
  );
}

void bootstrap();
