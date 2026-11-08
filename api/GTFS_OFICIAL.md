# GTFS oficial de São José dos Campos

O GuiaMobi usa o feed GTFS oficial de São José dos Campos como fonte de transporte público.

## Importação

Na pasta `api`:

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate
npm run validate:gtfs
npm run import:gtfs:official
```

Depois, mantenha no `.env`:

```env
TRANSIT_PROVIDER="gtfs"
```

A identidade de uma rota é `routes.txt.route_id`, armazenada em `TransitLine.gtfsRouteId`.
`route_short_name` é somente o código exibido e não é único. O feed oficial contém códigos repetidos.

Nenhum serviço externo de roteamento é utilizado para calcular rotas. O cálculo da busca direta é feito com:
- `stops.txt`
- `trips.txt`
- `stop_times.txt`
- `calendar.txt`
- `calendar_dates.txt`
- `shapes.txt`

Google Cloud Text-to-Speech permanece separado e não participa do cálculo de transporte.
