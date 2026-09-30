# Fonte de dados de transporte de São José dos Campos (US06/US09)

## Arquitetura atual (leia primeiro)

```
App (React Native) -> services/hooks -> API Fastify -> TransitProvider -> fonte
                                                       |- OtpRoutingProvider     (OpenTripPlanner próprio; só se OTP_URL)
                                                       |- GtfsDatabaseProvider   (GTFS oficial importado no PostgreSQL)
                                                       `- DevFixtureProvider     (SÓ desenvolvimento; NÃO é a rede de SJC)
```

`api/src/modules/routes/providers/index.ts` escolhe, a cada requisição, nesta ordem: OTP (se
configurado e com dados) > GTFS oficial importado (`dataSource = OFFICIAL_GTFS`) > fixture de
desenvolvimento (`dataSource = DEV_FIXTURE`). `GET /transit/status` devolve `provider` dizendo qual
está respondendo. Quando o GTFS oficial for importado, ele passa a valer sozinho, sem reescrever
controller, rotas nem app.

### Como ligar a rede completa (assim que o feed GTFS do InfoBus estiver acessível)

1. Aplicar migrations: `npx prisma migrate deploy` (a `20260927120000_gtfs_full_schema` cria agency,
   trips, stop_times, calendar, calendar_dates e shapes).
2. Importar: `npm run import:gtfs -- ./feed-sjc.zip` (ou uma URL). Lê `agency.txt`, `routes.txt`,
   `stops.txt`, `trips.txt`, `stop_times.txt`, `calendar.txt` e, quando existirem, `calendar_dates.txt` e
   `shapes.txt`. Sem limite de linhas/paradas/viagens/horários. Reexecutável (agências, linhas e
   paradas são atualizadas; viagens, horários, calendário e shapes são substituídos).
3. Pronto: busca origem→destino (por viagem real, respeitando calendar/calendar_dates), busca por
   número/nome, traçado real (shapes) e horários reais (stop_times) passam a vir do feed.
4. Atualização periódica: agendar o mesmo comando (cron) quando o feed for republicado.

### OpenTripPlanner (opcional, recomendado para transferências/caminhada)

OTP é só o motor: precisa de **GTFS de SJC + extrato OpenStreetMap** como entrada.

```yaml
# docker-compose.otp.yml (referência - não testado neste repositório)
services:
  otp:
    image: opentripplanner/opentripplanner:2.6.0
    command: ["--build", "--serve", "/var/opentripplanner"]
    ports: ["8080:8080"]
    volumes:
      - ./otp-data:/var/opentripplanner   # colocar aqui: feed-sjc.zip + sao-paulo-latest.osm.pbf (Geofabrik, recortado para SJC)
```
Depois: `OTP_URL=http://localhost:8080` no `.env` da API. `OtpRoutingProvider` fala GraphQL com o OTP.

### Tempo real (GTFS-Realtime) - não confundir

| Conceito | O que é | Fonte no projeto | Situação hoje |
|---|---|---|---|
| Horário estático | grade programada (`stop_times.txt`) | GTFS importado | pronto p/ receber o feed |
| Previsão | chegada/partida atualizada (Trip Updates) | `GTFS_REALTIME_TRIP_UPDATES_URL` | **indisponível** (sem acesso) |
| Atraso | diferença previsão x estático | Trip Updates | **indisponível** |
| Interrupção/aviso | texto da operadora (Service Alerts) | `GTFS_REALTIME_SERVICE_ALERTS_URL` | **indisponível** |
| Posição do veículo | lat/lon ao vivo (Vehicle Positions) | `GTFS_REALTIME_VEHICLE_POSITIONS_URL` | **indisponível** |

`GtfsRealtimeHttpProvider` implementa o protocolo real (pacote oficial `gtfs-realtime-bindings`) e só
faz chamadas de rede se a URL correspondente estiver configurada; sem URL, `NullRealtimeProvider`
responde `available:false` e o app não mostra nenhum veículo/atraso/alerta.

### Endpoints
`GET /routes/search` | `GET /routes/lines/search?query=` | `GET /routes/lines/:id` |
`GET /routes/lines/:id/vehicle-positions` | `GET /routes/lines/:id/service-alerts` |
`GET /routes/nearby-lines?lat&lng&radius` | `GET /transit/status` | `GET /geocode/search` (bounded a SJC) |
`GET /geocode/reverse` (endereço real de uma parada) | `GET /poi/nearby` (Overpass/OSM).

### O que é real e o que é fixture
- **Fixture de desenvolvimento** (`DEV_FIXTURE`): catálogo de 100 linhas (nome/código da página da
  Prefeitura) + trajeto simplificado de 3 linhas + 61 horários da linha 323. **Não é a rede completa.**
- **Nada com `OFFICIAL_GTFS` está carregado** enquanto o feed oficial não for importado.

---

(Histórico da investigação de fontes, mantido abaixo.)


## O que existe hoje neste projeto (dado real, verificável)

- **Catálogo de linhas** (`api/prisma/seed/officialLines.ts`): código, nome e
  link do PDF oficial de horário/itinerário de ~93 linhas, copiados
  diretamente da página oficial da Prefeitura:
  https://sjc.sp.gov.br/servicos/mobilidade-urbana/transporte-coletivo/
  (consultada em 25/09/2026). Isso é 100% real - nenhum número, nome ou link
  foi inventado. Essas linhas entram no banco como `isOfficialData: true` e
  já alimentam a busca real por número/nome (`GET /routes/lines/search`,
  US06/R07).
- **Geocodificação de endereços** (`api/src/modules/geocode/`): real, via
  Nominatim/OpenStreetMap, com viewbox enviesado para São José dos
  Campos/Vale do Paraíba (sem excluir endereços de fora), cache, fila
  respeitando 1 req/s e User-Agent identificado - conforme a política de uso
  do Nominatim (https://operations.osmfoundation.org/policies/nominatim/).

## O que NÃO existe hoje (e por quê nenhum dado foi inventado)

Pesquisa feita nesta sprint, cobrindo todas as fontes gratuitas conhecidas:

| Fonte pesquisada | Resultado |
|---|---|
| GTFS estruturado público (Transitland, Mobility Database, World Bank Data Catalog) | **Não encontrado** para São José dos Campos. Esses catálogos têm São Paulo (SPTrans/EMTU) e Porto Alegre, mas não SJC. |
| Portal de dados abertos da Prefeitura de SJC | Publica apenas **PDFs por linha** (itinerário em texto + tabela de horários), sem GTFS/CSV/API. |
| Sistema interno da Prefeitura ("InfoBus") | Existe e está em operação desde 2014 (contratado com a empresa Engineering), cobrindo as ~101 linhas da cidade com posição de veículo por GPS e previsão de chegada - ou seja, tem tempo real de verdade. Mas é operado por um fornecedor privado contratado e **não tem API pública/self-service documentada** para terceiros (confirmado em material institucional da Engineering/ABES, 2022, e reconfirmado em nova busca em set/2026). |
| Moovit Public Transit API | Existe, mas é **comercial**: sem cadastro self-service, credenciais só por negociação comercial. Não é gratuita/aberta. |
| Cittamobi | Plataforma comercial credenciada pela Prefeitura (Decreto 19.294/2023); **sem API pública documentada** para terceiros. |
| Bus2/Mobilibus (`painel.mobilibus.com`) | Painel web público *para passageiros* (sem login), mas a posição em tempo real roda sobre uma instância privada de Traccar; é a API **interna e não documentada** de uma empresa terceira (Bus2 Planejamento, Operação e Inovação em Mobilidade Ltda.) - reaproveitá-la sem autorização seria usar a API não pública de outra empresa, o que evitamos por princípio, independente de estar tecnicamente acessível. |
| OpenStreetMap (`route=bus`, Overpass API) | Cobertura de rotas de ônibus mapeadas por voluntários é, na prática, esparsa fora das grandes capitais; não há confirmação de cobertura completa para SJC, e não foi possível validar isso a partir deste ambiente (Overpass não está na lista de domínios liberados aqui). Não foi integrado por falta de uma fonte confirmável. |

**Conclusão:** não existe, até esta auditoria, uma fonte gratuita, pública e
estruturada (GTFS/CSV/API aberta) com paradas/coordenadas/horários de
transporte de São José dos Campos que possa ser integrada de forma íntegra.
Os PDFs oficiais têm o texto do itinerário (sequência de ruas, não paradas
com coordenadas) e uma tabela de horários cuja extração como texto simples
**não preserva o alinhamento das colunas de forma confiável** (os minutos de
cada horário aparecem em uma grade cujo número de linhas varia por hora,
então reconstruir "que minuto pertence a que hora" a partir do texto puro
arriscaria inventar um horário errado e apresentá-lo como real - exatamente
o que a sprint pediu para evitar).

## Caminhos reais para completar isso (nenhum deles foi fabricado agora)

1. **Credenciamento oficial (Decreto 19.294/2023).** A Prefeitura abre
   credenciamento para plataformas que queiram receber dados de localização
   dos veículos via API da Secretaria de Mobilidade Urbana. Pedido pelo
   Prefbook ou protocolo de atendimento do município. É o caminho mais
   direto para dados de posição/horário em tempo real verdadeiramente
   oficiais.
2. **Transcrição manual/visual dos PDFs.** Cada um dos ~93 PDFs listados em
   `officialLines.ts` tem o itinerário completo e a tabela de horários; um
   humano (ou um OCR com detecção de tabela, não extração de texto simples)
   pode transcrever isso com segurança. Depois de transcrito, os dados
   entram como `TransitStop`/`LineStop`/`TransitDeparture` com
   `isOfficialData: true`, e a busca por origem/destino passa a considerar
   essa linha automaticamente, sem qualquer mudança de tela.
3. **GTFS-Realtime**, se algum dia publicado, alimentaria `TransitLineStatus`
   (atrasos/indisponibilidade) - hoje vazio, nunca inventado.

## Reinvestigação (rodada atual) — GTFS oficial / InfoBus / OpenTripPlanner

Repeti a investigação priorizando exatamente a ordem pedida: GTFS oficial/InfoBus + OpenTripPlanner primeiro, depois qualquer API pública com cobertura real de SJC, e só then HERE Transit/Transitland/outras. Resultado:

- **INFOBUS é real e está em operação**: sistema contratado pela Prefeitura junto à empresa **Engineering** desde 2014, hoje cobrindo as ~101 linhas da cidade, com previsão de chegada baseada em GPS dos veículos (fonte: ABES/Engineering, case "Primeira Smart City do Brasil", 2022). Ou seja, existe uma fonte de dados em tempo real (posição do veículo, previsão de chegada) — mas ela é operada por um fornecedor privado contratado, **sem API pública/self-service documentada** para terceiros. Sem isso, **OpenTripPlanner não pode ser alimentado**: OTP é só o motor de roteamento, ele exige um GTFS real como insumo, e não existe um GTFS de SJC publicamente baixável para dar a ele.
- **Transitland**: consultado novamente por cidade/estado; não retorna nenhum operador para São José dos Campos (SP) - só aparece São José dos **Pinhais** (PR, outra cidade, coberta pela URBS de Curitiba), uma coincidência de nome, não a fonte procurada.
- **HERE Transit / outras APIs comerciais de transporte**: não foram adotadas porque nenhuma delas confirma cobertura de linhas/paradas de São José dos Campos especificamente (ter "transporte público" no geral não é o mesmo que ter a rede desta cidade) - critério que a própria auditoria pediu para respeitar.
- **Conclusão mantida e reforçada**: não há, até esta data, uma fonte gratuita e pública (GTFS oficial, InfoBus, ou qualquer API de terceiros) com cobertura real e estruturada da rede de ônibus de São José dos Campos. O caminho correto é o credenciamento oficial já documentado acima (Decreto 19.294/2023), não scraping nem substituição por uma API sem cobertura real.
- Por isso, o subconjunto real de 3 linhas com trajeto verificado (seção abaixo) **não é tratado como solução definitiva da US06** - é a prova de que a arquitetura funciona com dado real, mantida apenas como referência enquanto o acesso oficial não chega. A classificação da US06 nesta auditoria reflete isso (ver relatório da sessão).

## O que já está pronto para receber dados reais, sem mudar UI

- `TransitLine.officialSourceUrl` guarda o link do PDF oficial de cada linha
  já cadastrada - útil para, futuramente, abrir a fonte original.
- `routes.service.ts` já ignora qualquer linha com `isOfficialData: false`
  por padrão, já soma atraso/exclui linha indisponível quando
  `TransitLineStatus` existir, e já busca `nextDeparture` real em
  `TransitDeparture` quando essa tabela for populada - hoje ficam vazias,
  nenhum atraso/horário é inventado.
- `/transit/status` agora informa `linesCount` (quantas linhas oficiais
  conhecemos pelo nome) separado de `linesWithRouteDataCount` (quantas já
  têm paradas cadastradas) - isso permite ao app dizer, com precisão,
  "conhecemos ~93 linhas de SJC, mas o trajeto detalhado só está disponível
  para X delas" em vez de simplesmente "sem dados".

## Atualização (rodada seguinte): trajeto real para 3 linhas

`realLineRoutes.ts` popula um trajeto real (ida e volta) para as linhas
**323, 128 e 103**, com:

- Coordenadas de bairro: pontos geodésicos oficiais da Prefeitura/INPE
  (SIRGAS2000), cada um citando o PDF de origem.
- Coordenada do Terminal Central: aproximada pela coordenada central do
  município (Wikipédia/OSM), já que não há um geocode preciso do prédio.
- Duração: estimada por distância real (Haversine) ÷ velocidade média
  assumida de ônibus urbano (20 km/h) - nunca um horário-relógio inventado.
- Horários de partida da linha 323: **reais**, extraídos do PDF oficial
  (`https://www.sjc.sp.gov.br/media/rddfbq2o/323-53f.pdf`), com a contagem
  impressa no PDF ("(29)"/"(32)") conferida contra a quantidade de horários
  transcritos, como verificação de integridade.

Isso foi testado localmente contra um PostgreSQL real (ver relatório da
sessão): busca de linha por número/nome retorna as linhas oficiais reais;
uma consulta origem→destino real encontra a linha 323 com parada, distância,
duração estimada e o próximo horário real; uma origem/destino fora da
cobertura retorna corretamente zero opções, sem inventar nada.

As outras ~97 linhas continuam sem paradas cadastradas - permanece o mesmo
caminho já documentado acima (credenciamento oficial ou transcrição
manual/OCR dos PDFs) para estendê-las.

