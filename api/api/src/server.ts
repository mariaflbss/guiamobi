import 'dotenv/config';
import { buildApp } from './app';
import { env } from './config/env';
import { notificationsService } from './modules/notifications/notifications.service';

const app = buildApp();

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    console.log(`API do GuiaMobi rodando em http://localhost:${env.PORT}`);

    // US17: verifica Service Alerts oficiais periodicamente. A rotina não
    // gera dados fictícios; sem GTFS-Realtime configurado, ela não envia nada.
    void notificationsService.checkServiceAlerts().catch((error) => {
      console.warn('[Notifications] Verificação inicial falhou:', error);
    });

    setInterval(() => {
      void notificationsService.checkServiceAlerts().catch((error) => {
        console.warn('[Notifications] Verificação periódica falhou:', error);
      });
    }, 60_000);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
