# Como executar o projeto

## Pré-requisitos

- Node.js 18 ou superior
- PostgreSQL 14+ rodando localmente (ou em Docker)
- Aplicativo **Expo Go** no celular (ou emulador Android/iOS configurado)

## 1. API

```bash
cd api
cp .env.example .env
# edite o .env e configure DATABASE_URL com suas credenciais do PostgreSQL

npm install
npx prisma generate
npx prisma migrate dev --name init
# se o banco já existia (versão anterior), rode também:
# npx prisma migrate dev --name add_avatar
npx prisma db seed
# popula as linhas 301 e 315 usadas pelo cálculo de rotas (Prioridade 1)

npm run dev
# API disponível em http://localhost:3333
```

Endpoints principais:

| Método | Rota                     | Descrição                              |
|--------|---------------------------|-----------------------------------------|
| POST   | `/auth/register`          | Cadastro de usuário                     |
| POST   | `/auth/login`              | Login (retorna `accessToken`)           |
| POST   | `/auth/forgot-password`    | Solicita recuperação de senha por e-mail|
| POST   | `/auth/reset-password`     | Redefine a senha com o token recebido   |
| GET    | `/auth/me`                 | Dados do usuário autenticado (protegida)|
| GET    | `/users/me`                | Perfil do usuário autenticado (protegida)|
| PATCH  | `/users/me`                | Edita nome, e-mail, senha e avatar (protegida)|
| GET    | `/geocode/search?q=`       | Busca de endereços via Nominatim (protegida)|
| GET    | `/transit/status`          | Situação dos dados de linhas (protegida)|
| GET    | `/routes/search`           | Busca rotas por origem/destino (protegida)|
| GET    | `/routes/lines/:lineId`    | Detalhe de uma linha (protegida)        |
| GET    | `/health`                  | Verificação de saúde da API             |

### E-mail e busca de endereços

- **SMTP**: preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e
  `SMTP_FROM` no `api/.env`. Sem isso, em desenvolvimento o e-mail de
  recuperação de senha só é escrito no log da API (nada é enviado) e em
  produção a API responde 503.
- **Endereços**: informe em `GEOCODING_CONTACT` um e-mail ou site de contato
  do projeto (exigido pela política do Nominatim público). Para uso intenso,
  use uma instância própria em `GEOCODING_BASE_URL`.

## 2. Mobile

```bash
cd mobile
cp .env.example .env
# edite EXPO_PUBLIC_API_URL se a API não estiver em http://localhost:3333
# (em dispositivo físico, use o IP da máquina na rede local, ex.: http://192.168.0.10:3333)

npm install
npm start
```

O app usa **Expo SDK 57**. O Expo Go da loja precisa suportar essa versão; se
não suportar, use um emulador ou um *development build*. Opcionalmente, defina
`EXPO_PUBLIC_SUPPORT_EMAIL` e `EXPO_PUBLIC_SUPPORT_PHONE` no `.env` para
exibir contatos na tela Ajuda.

Escaneie o QR code exibido no terminal com o app **Expo Go**, ou pressione
`a`/`i` no terminal para abrir em um emulador Android/iOS.

## Observações

- O app mobile funciona de forma independente da API para as
  funcionalidades locais (favoritos, histórico, configurações de
  acessibilidade e idioma) — apenas cadastro/login/recuperação de senha
  exigem a API rodando e acessível.
- Em caso de negação de permissão de localização, o app permite continuar
  buscando o endereço de origem pela busca de endereços.
- A busca de endereços e de rotas passa pela API: sem internet ou sem a API
  no ar, o app avisa claramente em vez de mostrar resultados falsos.
