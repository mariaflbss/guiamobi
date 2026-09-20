import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { registerJwt } from './utils/jwt';
import { registerErrorHandler } from './middleware/errorHandler';
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { transitRoutes } from './modules/routes/routes.routes';
import { geocodeRoutes } from './modules/geocode/geocode.routes';

/**
 * Monta a aplicação Fastify: plugins, tratamento de erros e rotas.
 * Mantida em um arquivo separado do server.ts para facilitar testes
 * automatizados (permite instanciar o app sem subir a porta HTTP).
 */
export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
      // Nunca logar corpo de requisições (pode conter senha/token)
      redact: ['req.body.password', 'req.body.newPassword', 'req.headers.authorization'],
    },
  });

  app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
  });

  registerJwt(app);
  registerErrorHandler(app);

  // Rota de verificação de saúde da API
  app.get('/health', async () => ({ status: 'ok' }));

  app.register(authRoutes);
  app.register(usersRoutes);
  app.register(transitRoutes);
  app.register(geocodeRoutes);

  return app;
}
