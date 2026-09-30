# Arquitetura — GuiaMobi Acessível

## Visão geral

O projeto é dividido em duas aplicações independentes, sem microserviços,
filas ou caches distribuídos:

```text
GuiaMobi/
├── mobile/    # React Native + Expo + TypeScript
├── api/       # Node.js + TypeScript + Fastify + Prisma + PostgreSQL
└── docs/
```

## Princípio central

> Mobile primeiro para funcionalidades do dispositivo; API somente quando
> houver necessidade real de backend.

| Responsabilidade                        | Onde vive                              |
|------------------------------------------|-----------------------------------------|
| GPS / localização                        | `mobile` (`expo-location`)              |
| Texto em voz (TTS)                       | `mobile` (`expo-speech`)                |
| Vibração / feedback tátil                | `mobile` (`expo-haptics`)               |
| Conectividade                            | `mobile` (`@react-native-community/netinfo`) |
| Idioma da interface                      | `mobile` (`i18next` + `react-i18next`)  |
| Favoritos e histórico de pesquisas       | `mobile` (`expo-sqlite`, local)         |
| Sessão do usuário / token                | `mobile` (`expo-secure-store`)          |
| Cadastro, login, recuperação de senha    | `api` (Fastify + Prisma + Argon2 + JWT) |
| Dados que exigem servidor (futuro)       | `api`                                    |

## Fluxo padrão (mobile)

```text
Screen
  ↓
Hook / Context
  ↓
Service
  ↓
API ou recurso nativo (expo-*)
```

- **Screens** (`src/screens`): apenas UI e orquestração simples; não
  contêm regra de negócio nem chamadas diretas a bancos/APIs.
- **Hooks/Contexts** (`src/hooks`, `src/contexts`): estado da aplicação
  (sessão, preferências, favoritos, histórico, busca de endereço).
- **Services** (`src/services`, `src/database`): única camada que
  conhece detalhes de implementação (fetch para a API, chamadas ao
  expo-location/expo-speech/expo-haptics, SQL do SQLite).

## Estrutura do mobile

```text
mobile/src/
├── screens/         # Telas (Login, Cadastro, Home, Favoritos, Histórico, Configurações...)
├── components/      # Componentes acessíveis reutilizáveis
├── navigation/      # React Navigation (stacks e tabs)
├── hooks/           # useAuth, useLocationSearch, useFavorites, useSearchHistory...
├── contexts/        # AuthContext, AccessibilityContext
├── services/
│   ├── api/         # httpClient, authService
│   ├── location/    # locationService (GPS), geocodingService (busca de endereço)
│   ├── speech/       # speechService (TTS)
│   ├── haptics/      # hapticsService (vibração)
│   └── connectivity/ # connectivityService (NetInfo)
├── database/
│   ├── repositories/ # favoritesRepository, historyRepository (SQLite)
│   └── migrations/    # criação das tabelas locais
├── types/           # tipos compartilhados (auth, location, favorites, settings)
├── utils/
├── constants/        # config (URLs, chaves de storage) e cores
├── theme/            # construção do tema (fonte, contraste, modo escuro)
└── locales/          # traduções pt/en/es + inicialização do i18next
```

## Estrutura da API

```text
api/
├── src/
│   ├── modules/
│   │   ├── auth/     # cadastro, login, recuperação de senha
│   │   └── users/    # perfil do usuário autenticado
│   ├── database/     # cliente Prisma
│   ├── middleware/   # auth guard (JWT) e tratamento de erros
│   ├── integrations/
│   │   └── email/    # envio de e-mail de recuperação de senha
│   ├── config/        # validação de variáveis de ambiente (Zod)
│   ├── utils/         # hash (Argon2), JWT
│   ├── app.ts         # montagem do Fastify (plugins, rotas)
│   └── server.ts      # bootstrap HTTP
└── prisma/
    └── schema.prisma  # modelos User e PasswordResetToken
```

A API é monolítica e simples de propósito: apenas os módulos necessários
para autenticação nesta sprint. Novos módulos (ex.: `routes`, para cálculo
de rotas de transporte público) podem ser adicionados seguindo o mesmo
padrão (`*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts`)
quando uma US futura exigir isso.

## Segurança

- Senhas de usuário: hash com **Argon2id**.
- Sessão: **JWT** assinado pela API, armazenado no dispositivo via
  **expo-secure-store** (nunca em `AsyncStorage`/localStorage).
- Tokens de recuperação de senha: gerados aleatoriamente, armazenados no
  banco apenas como hash SHA-256, com expiração de 30 minutos e uso único.
- Nenhuma senha, token ou dado sensível é escrito em logs (o logger da API
  usa `redact` para os campos sensíveis).

## Acessibilidade (US03) como preocupação transversal

A acessibilidade não é uma tela isolada: é aplicada através de:

- `AccessibilityContext` + `theme/theme.ts`: fonte escalável, alto
  contraste e modo escuro, aplicados a todas as telas.
- Componentes base (`AccessibleText`, `AccessibleButton`,
  `AccessibleTextInput`, `SettingSwitchRow`, `SelectableChipGroup`) que já
  encapsulam `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`,
  `accessibilityState` e área de toque mínima de 44x44.
- Uso de `ActivityIndicator` nativo (sem animações rápidas/piscantes).
- Mensagens de erro/aviso sempre com texto explícito, nunca apenas cor.
