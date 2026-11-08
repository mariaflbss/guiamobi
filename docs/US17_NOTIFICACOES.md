# US17 — Notificações sobre alterações nas linhas

## Como funciona

1. O usuário acompanha linhas (botão de sino em **Detalhes da linha** ou **Notificações > Adicionar linha**).
2. A chave geral, as linhas e os avisos recebidos ficam no SQLite do aparelho, por usuário (migração 7).
3. O app consulta `GET /notifications/line-notices` para as linhas acompanhadas: a cada 60 s com o app aberto em **qualquer tela** (inclusive durante a viagem), ao voltar ao app, ao recuperar a internet e, com o app fechado, por tarefa em segundo plano (melhor esforço, decidida pelo sistema, ~15 min).
4. Cada aviso novo (chave `linha:id:hash do texto`) é gravado e notificado uma única vez: faixa dentro do app (com voz/vibração conforme US08) se o app está aberto; notificação do sistema se está fechado/em segundo plano.
5. A cópia na conta (`PUT/GET /notifications/subscriptions`) é sincronizada em silêncio; o estado local sempre vence.

Tipos: **interrupção** (situação UNAVAILABLE, alerta NO_SERVICE ou texto "interrompida/suspensa"), **desvio** (alerta DETOUR ou texto "desvio") e **alteração** (atraso e demais alertas).

## Critérios de aceitação

| Critério | Onde |
|---|---|
| Ativar/cancelar | Chave em Notificações; seguir/parar em Detalhes da linha |
| Manter estado ao sair/voltar | SQLite (`notification_preferences`, `line_subscriptions`) |
| Adicionar/remover linhas | `NotificationsScreen`, `RouteDetailScreen` |
| Persistir inscrições | SQLite + cópia na API (`line_subscriptions`) |
| Alterações, desvios, interrupções | `notifications.service.ts` (API), `LineNoticeKind` |
| Durante e fora da navegação | `NotificationsProvider` + `backgroundTask.ts` |
| Sem mensagens técnicas | `expo-notifications` só é carregado fora do Expo Go/web; nenhuma API de push token é usada; `/notifications/*` não gera log de erro |
| Falha de API silenciosa | `checkLineNotices` / `syncSubscriptions` nunca lançam; sync fica pendente |
| Sem quebrar o resto | US16 (cache offline) intocada; só edições aditivas |

## Limitações (infraestrutura externa)

- **Push remoto não existe**: não há servidor de push. Com o app fechado o aviso depende da tarefa em segundo plano do sistema (não imediata, não garantida; inexistente no Expo Go).
- **Expo Go Android** não exibe notificações do sistema: os avisos aparecem na faixa e na tela de Notificações. Notificação do sistema exige development build/app instalado.
- Sem feed GTFS-Realtime configurado e sem `TransitLineStatus`, não há avisos (nada é inventado). Para testar: `MOCK_TRANSIT_SCENARIO=unavailable-<código>` ou `delayed-<código>`.
- Não verificado em aparelho real (permissão, tarefa em segundo plano, leitor de tela).

## Teste da Task 1 — alterações, desvios e interrupções

Para testar sem depender de um feed GTFS-Realtime externo, use uma linha existente no banco e altere `MOCK_TRANSIT_SCENARIO` no `.env` da API para um destes cenários, reiniciando a API depois:

- `delayed-<código>` → alteração/atraso;
- `detour-<código>` → desvio;
- `unavailable-<código>` → interrupção.

Com a linha acompanhada e as notificações ativadas, em desenvolvimento a tela de Notificações mostra três controles de teste: **Simular alteração**, **Simular desvio** e **Simular interrupção**. Cada controle consulta o mesmo endpoint de avisos usado pela aplicação e gera o aviso para as linhas acompanhadas, sem depender de GTFS-Realtime. **Verificar avisos agora** continua sendo a consulta real, sem cenário de teste.

O mesmo mecanismo de verificação automática é executado enquanto o app está aberto, inclusive durante o acompanhamento da viagem. Os controles de simulação são exclusivos de desenvolvimento (`__DEV__`) e não aparecem na versão de produção.

O cenário deve gerar um aviso uma única vez para aquela alteração. Para testar novamente o mesmo cenário, altere o texto/identificador do cenário ou limpe os avisos locais; simplesmente consultar novamente não deve duplicar a mesma notificação.

## Para rodar

```bash
cd api && npx prisma migrate deploy && npx prisma generate
cd mobile && npm install   # novas deps: expo-notifications, expo-constants, expo-task-manager, expo-background-task
```
