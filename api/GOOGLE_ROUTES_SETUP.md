# Google Routes API — GuiaMobi

## Configuração

No `api/.env`:

```env
TRANSIT_PROVIDER="google"
GOOGLE_ROUTES_API_KEY="SUA_CHAVE_DO_GOOGLE_CLOUD"
```

A chave deve permanecer somente no backend e não deve ser commitada nem enviada ao GitHub.

## Reiniciar

```bash
cd api
npm run dev
```

## Teste no app

Use uma origem e destino dentro de São José dos Campos, por exemplo:

- Terminal Central → Avenida São José

O backend chama:

`POST https://routes.googleapis.com/directions/v2:computeRoutes`

com `travelMode: TRANSIT`, modo permitido `BUS`, horário de partida atual e máscara de campos para duração, passos e detalhes de transporte público.

A Routes API exige uma máscara de campos e fornece, para rotas de transporte público, parada de embarque, parada de chegada, horários, linha e quantidade de paradas. A implementação usa somente esses campos e não cria dados de linha artificialmente.

## Se não aparecer rota

Olhe o terminal do backend. Agora ele registra:

```text
[GoogleRoutes] X rota(s) retornada(s) pela Routes API.
[GoogleRoutes] Y opção(ões) diretas de ônibus convertidas para o contrato do GuiaMobi.
```

Se `X > 0` e `Y = 0`, a Google retornou rotas, mas nenhuma rota pôde ser representada pelo contrato atual do GuiaMobi (que trabalha com uma única linha de ônibus por opção).

Se houver erro HTTP, o backend registra o erro completo no terminal e a API não cai silenciosamente para o mock.
