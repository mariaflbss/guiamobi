# Mock da US06 — GuiaMobi Acessível

Este ambiente usa `DevFixtureProvider` para validar a US06 sem Google Routes.

## Dados usados

Baseados nos PDFs oficiais da Prefeitura de São José dos Campos:

- 101 — Represa / Terminal Central — OSO 48 — alteração 17/01/2026
- 121 — Urbanova / Esplanada / Terminal Central — OSO 68 — alteração 13/04/2026
- 128 — Urbanova-Colinas / Terminal Central — OSO 40

Os nomes de vias/locais e os horários selecionados são provenientes dessas publicações. Algumas coordenadas são referências geográficas aproximadas e os minutos entre pontos são calculados pela fixture; portanto, não são GTFS oficial nem previsão de viagem.

## Cenários de teste

No `.env` da API:

```env
TRANSIT_PROVIDER="dev"
MOCK_TRANSIT_SCENARIO="normal"
```

Para testar atraso/alternativas:

```env
MOCK_TRANSIT_SCENARIO="delayed-101"
```

Para testar indisponibilidade/alternativas:

```env
MOCK_TRANSIT_SCENARIO="unavailable-101"
```

Os cenários `delayed-*` e `unavailable-*` são explicitamente simulados e não representam uma ocorrência real.
