import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.CONSUMER_PORT || 3001;
  await app.listen(port);
  console.log(
    `CDC Consumer Service is running (with health check) on: http://localhost:${port}`,
  );
}
void bootstrap();
