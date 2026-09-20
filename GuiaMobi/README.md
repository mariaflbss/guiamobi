# GuiaMobi Acessível

Aplicativo de transporte público acessível, composto por um app mobile
(React Native + Expo SDK 57) e uma API REST (Node.js + Fastify).

```text
GuiaMobi/
├── mobile/    # Aplicativo React Native (Expo + TypeScript)
├── api/       # API REST (Fastify + Prisma + PostgreSQL)
└── docs/      # Documentação do projeto
```

## Documentação

- [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md) — visão geral da arquitetura e das responsabilidades de cada camada.
- [`docs/SPRINT1.md`](./docs/SPRINT1.md) — funcionalidades implementadas na Sprint 1 (US01, US03, US05, US07, US08).
- [`docs/REVISAO.md`](./docs/REVISAO.md) — revisão pós-Sprint 1: bugs corrigidos, fluxo de rotas implementado, tutorial e pendências reais.
- [`docs/ATUALIZACAO_INTERFACE.md`](./docs/ATUALIZACAO_INTERFACE.md) — reconstrução da interface (Expo SDK 57): o que mudou, o que foi verificado e o que não foi.
- [`docs/COMO_EXECUTAR.md`](./docs/COMO_EXECUTAR.md) — passo a passo para rodar a API e o app mobile localmente.

## Visão geral rápida

- **Mobile**: React Native + Expo + TypeScript, com React Navigation, TanStack
  React Query, expo-location, expo-speech, expo-haptics, expo-secure-store,
  expo-sqlite, NetInfo, i18next e lucide-react-native (ícones).
- **API**: Node.js + TypeScript + Fastify, com Prisma (PostgreSQL), JWT,
  Argon2, Zod e Nodemailer.
- **Princípio de arquitetura**: o que é do dispositivo (GPS, voz, vibração,
  armazenamento local) fica no mobile; a API só é usada para autenticação e
  dados que realmente exigem backend.
