import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true, // HttpOnly cookie nurseapp_refresh SameSite=Lax B-03 B-04
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`AIGH Workforce Backend v2.8.7b listening on 0.0.0.0:${port}`);
  console.log(`Role Matrix CRUD §8: /api/v1/roles/assignments`);
}

bootstrap();
