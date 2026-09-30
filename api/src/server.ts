import 'dotenv/config';
import { buildApp } from './app';
import { env } from './config/env';

const app = buildApp();

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    console.log(`API do GuiaMobi rodando em http://localhost:${env.PORT}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
