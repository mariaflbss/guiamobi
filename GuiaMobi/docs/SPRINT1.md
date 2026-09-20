# Sprint 1 — Funcionalidades implementadas

## US01 — Cadastro, autenticação e recuperação de conta

- Cadastro com nome, e-mail e senha (`RegisterScreen` → `AuthContext.register`
  → `authService.register` → `POST /auth/register`).
- Login (`LoginScreen` → `AuthContext.login` → `POST /auth/login`), com token
  JWT assinado pela API.
- Recuperação de senha por e-mail (`ForgotPasswordScreen` →
  `POST /auth/forgot-password` → geração de token de uso único → e-mail com
  link de redefinição → `POST /auth/reset-password`).
- Validação de campos no app (Zod nas telas — a validar) e novamente na API
  (Zod nos schemas do módulo `auth`).
- Tratamento de erros com mensagens amigáveis (`InlineMessage`) e sem expor
  detalhes internos.
- Senhas com hash Argon2id; sessão (token + dados do usuário) armazenada via
  `expo-secure-store`.
- Restauração automática da sessão ao abrir o app (`AuthProvider`).
- Labels visíveis em todos os campos e botões com `accessibilityRole`.

## US03 — Interface acessível e adaptável

- `AccessibilityContext` + `theme/theme.ts`: tamanho de fonte (pequeno,
  médio, grande), alto contraste e modo escuro aplicados globalmente.
- Componentes base com área de toque mínima de 44x44
  (`AccessibleButton`, `AccessibleTextInput`, `SettingSwitchRow`).
- `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` e
  `accessibilityState` aplicados nos principais componentes interativos.
- Elementos puramente decorativos marcados com `accessibilityElementsHidden`
  (ex.: emojis de logo e ícones das abas).
- Nenhuma ação depende apenas de cor/ícone: mensagens de erro/aviso sempre
  trazem texto explícito (`InlineMessage`), e o alto contraste reforça texto
  secundário e bordas, não apenas o preenchimento de cor.
- Uso exclusivo de `ActivityIndicator` nativo (sem animações
  customizadas rápidas ou piscantes).
- `allowFontScaling` habilitado em todos os textos (`AccessibleText`),
  respeitando o ajuste de fonte do sistema operacional.
- Contraste das paletas clara/escura pensado para atender WCAG 2.1 AA
  (mínimo 4.5:1 para texto normal).

## US05 — Definir origem e destino

- Origem por endereço digitado ou localização atual
  (`useLocationSearch.useCurrentLocation`, via `expo-location`).
- Solicitação de permissão de GPS e tratamento explícito de permissão
  negada (mensagem `home.locationDenied`, sem travar o fluxo — o usuário
  pode digitar o endereço manualmente).
- Sugestões de endereço/local via geocodificação (Nominatim/OpenStreetMap),
  com verificação de conectividade antes de qualquer chamada externa
  (`useConnectivity` + `connectivityService`).
- Mensagem clara de offline (`home.offlineSearch`) quando não há internet.

## US07 — Favoritos e histórico de pesquisas

- Favoritos com apelido definido pelo usuário, endereço e coordenadas,
  persistidos localmente em SQLite (`favoritesRepository`).
- Múltiplos favoritos, com criação e exclusão (com confirmação) na
  `FavoritesScreen`.
- Preenchimento rápido de origem/destino a partir de um favorito, na
  `HomeScreen`.
- Histórico das últimas 10 pesquisas (`MAX_HISTORY_ITEMS`), com limpeza
  automática dos registros mais antigos (`historyRepository.create`).
- Última rota pesquisada sugerida ao reabrir o app (`useSearchHistory.lastRoute`,
  exibida como atalho na `HomeScreen`).
- Toda a persistência desta US é local (SQLite), sem depender da API —
  conforme a arquitetura definida ("favoritos/histórico quando não houver
  necessidade de servidor").

## US08 — Configurações de idioma, voz e feedback

- Três idiomas disponíveis (Português, Inglês, Espanhol) via `i18next` +
  `react-i18next`, com troca em tempo real na `SettingsScreen`.
- Persistência do idioma escolhido (`expo-secure-store`), restaurado ao
  abrir o app.
- Preferência de feedback: Voz / Vibração / Voz + Vibração / Nenhum
  (`FeedbackMode`), usada pelo `AccessibilityContext.announce` em toda a
  aplicação (ex.: erros de login, confirmação de rota encontrada).
- Ajuste de velocidade da fala (lenta/normal/rápida), aplicado via
  `expo-speech` (`speechService`).
- Botão "Testar voz" para o usuário validar a configuração atual.
- Todas as preferências (idioma, fonte, contraste, modo escuro, feedback,
  velocidade de voz, Modo Simples) persistidas localmente e recarregadas
  automaticamente ao abrir o app.

## Pendências / integrações que dependem de algo ainda inexistente

1. **Envio real de e-mail (SMTP)** *(implementado depois; ver `ATUALIZACAO_INTERFACE.md`)*: a estrutura está pronta
   (`api/src/integrations/email/emailSender.ts`), mas sem credenciais SMTP
   configuradas o e-mail é apenas registrado no log do servidor. Falta
   adicionar a dependência `nodemailer` (ou similar) e as credenciais reais
   de produção.
2. **Cálculo de rotas de transporte público**: a US05 cobre a definição de
   origem/destino; o cálculo/exibição de linhas, paradas e tempo de viagem
   (visto nos mockups de "Rotas encontradas", "Detalhes da linha",
   "Acompanhamento") depende de um módulo de rotas/GTFS que não faz parte
   do escopo desta sprint e não foi implementado.
3. **Banco de dados PostgreSQL**: o Prisma Client não pôde ser gerado no
   ambiente em que este código foi produzido (sem acesso de rede aos
   binários do Prisma). Rodar `npx prisma generate` e
   `npx prisma migrate dev` normalmente em um ambiente com internet e um
   PostgreSQL disponível.
4. **Tela "Ajuda"** e o restante do "Modo Simples" ilustrados nos mockups
   não fazem parte das cinco US desta sprint e não foram implementados
   (apenas o toggle de preferência "Modo Simples" existe em Configurações,
   como preparação para uma sprint futura).
