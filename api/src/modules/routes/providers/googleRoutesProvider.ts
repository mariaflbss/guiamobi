import { env } from '../../../config/env';
import { prisma } from '../../../database/prisma';
import { DevFixtureProvider } from './devFixtureProvider';
import { GtfsDatabaseProvider } from './gtfsDatabaseProvider';
import {
  matchGeoJsonStop,
  geoJsonStopCount,
} from '../../../integrations/geojson/busStops';
import {
  LineDetail,
  LineSearchResult,
  NearbyLine,
  RouteOption,
  SearchRoutesQueryInput,
  TransitProvider,
  TransitStatus,
} from './types';

const GOOGLE_ROUTES_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes';

const REQUEST_TIMEOUT_MS = 8000;
const SEARCH_CACHE_TTL_MS = 20_000;
const LINE_SEARCH_CACHE_TTL_MS = 30_000;
const LINE_DETAIL_CACHE_TTL_MS = 5 * 60_000;
const OFFICIAL_LINE_COUNT_CACHE_TTL_MS = 60_000;

const GOOGLE_FIELD_MASK = [
  'routes.duration',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.transitDetails.stopDetails',
  'routes.legs.steps.transitDetails.transitLine',
  'routes.legs.steps.transitDetails.stopCount',
  'routes.polyline.encodedPolyline',
].join(',');

interface GoogleLocation {
  latLng?: {
    latitude?: number;
    longitude?: number;
  };
}

interface GoogleTransitStop {
  name?: string;
  location?: GoogleLocation;
}

interface GoogleTransitLine {
  name?: string;
  nameShort?: string;
  uri?: string;
  agencies?: {
    name?: string;
    uri?: string;
  }[];
}

interface GoogleTransitStepDetails {
  stopDetails?: {
    departureStop?: GoogleTransitStop;
    arrivalStop?: GoogleTransitStop;
    departureTime?: string;
    arrivalTime?: string;
  };
  headsign?: string;
  transitLine?: GoogleTransitLine;
  stopCount?: number;
}

interface GoogleStep {
  travelMode?: string;
  startLocation?: GoogleLocation;
  endLocation?: GoogleLocation;
  transitDetails?: GoogleTransitStepDetails;
}

interface GoogleRoute {
  duration?: string;
  legs?: {
    steps?: GoogleStep[];
  }[];
  polyline?: {
    encodedPolyline?: string;
  };
}

interface GoogleResponse {
  routes?: GoogleRoute[];
}

function decodeGooglePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

function validCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function durationSeconds(value: unknown): number | null {
  if (typeof value !== 'string') return null;

  const match = value.match(/^(\d+(?:\.\d+)?)s$/);

  if (!match) return null;

  const seconds = Number(match[1]);

  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function stopFromGoogle(
  stop: GoogleTransitStop | undefined,
  fallbackName: string,
) {
  const lat = stop?.location?.latLng?.latitude;
  const lng = stop?.location?.latLng?.longitude;

  if (!validCoordinate(lat) || !validCoordinate(lng)) {
    return null;
  }

  const googleName = stop?.name?.trim() || fallbackName;

  const geoJsonMatch = matchGeoJsonStop(
    lat,
    lng,
    googleName,
  );

  return {
    id:
      geoJsonMatch?.id ??
      `google:${lat.toFixed(6)}:${lng.toFixed(6)}`,
    name: geoJsonMatch?.name || googleName,
    distanceMeters: 0,
    latitude: lat,
    longitude: lng,
  };
}

function lineBaseKey(
  line: GoogleTransitLine,
): string | null {
  const code = line.nameShort?.trim();
  const name = line.name?.trim();

  if (!code && !name) {
    return null;
  }

  return `google:${encodeURIComponent(
    code || name || 'line',
  )}`;
}

function stableOptionKey(
  line: GoogleTransitLine,
  boarding: {
    latitude: number;
    longitude: number;
  },
  alighting: {
    latitude: number;
    longitude: number;
  },
  departure?: string,
): string | null {
  const base = lineBaseKey(line);

  if (!base) {
    return null;
  }

  const raw = [
    base,
    boarding.latitude.toFixed(5),
    boarding.longitude.toFixed(5),
    alighting.latitude.toFixed(5),
    alighting.longitude.toFixed(5),
    departure || '',
  ].join(':');

  let hash = 0;

  for (let index = 0; index < raw.length; index += 1) {
    hash =
      ((hash << 5) - hash + raw.charCodeAt(index)) | 0;
  }

  return `${base}:${Math.abs(hash)}`;
}

function timeHHMM(
  timestamp?: string,
): string | null {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

/**
 * Provider real para cálculo de rotas de ônibus via Google Routes API.
 *
 * A Routes API calcula as viagens.
 * O catálogo de linhas e detalhes que não vêm diretamente
 * da API continuam sendo delegados ao provider local quando
 * disponíveis.
 */
export class GoogleRoutesProvider
  implements TransitProvider
{
  readonly name = 'google-routes' as const;

  private readonly devProvider =
    new DevFixtureProvider();

  private readonly gtfsProvider =
    new GtfsDatabaseProvider();

  private officialLineCountCache: { expiresAt: number; count: number } | null = null;
  private routeSearchInFlight = new Map<string, Promise<RouteOption[]>>();

  /**
   * Cache de detalhes das opções retornadas pela Google
   * durante a sessão do backend.
   *
   * A Routes API calcula a viagem, mas não oferece um
   * endpoint de catálogo de linhas.
   *
   * Guardamos o detalhe mínimo necessário para a tela
   * RouteDetail conseguir abrir a opção.
   */
  private readonly googleLineDetails =
    new Map<string, LineDetail>();

  private readonly routeSearchCache =
    new Map<string, { expiresAt: number; options: RouteOption[] }>();

  private readonly lineSearchCache =
    new Map<string, { expiresAt: number; lines: LineSearchResult[] }>();

  private officialCatalogCache: { expiresAt: number; lines: LineSearchResult[] } | null = null;

  private readonly lineDetailCache =
    new Map<string, { expiresAt: number; line: LineDetail | null }>();

  private async catalogProvider(): Promise<TransitProvider> {
    const now = Date.now();
    let officialLines = this.officialLineCountCache?.count ?? 0;
    if (!this.officialLineCountCache || this.officialLineCountCache.expiresAt <= now) {
      officialLines = await prisma.transitLine.count({ where: { dataSource: 'OFFICIAL_GTFS' } });
      this.officialLineCountCache = { count: officialLines, expiresAt: now + OFFICIAL_LINE_COUNT_CACHE_TTL_MS };
    }

    return officialLines > 0
      ? this.gtfsProvider
      : this.devProvider;
  }

  async getStatus(): Promise<TransitStatus> {
    return {
      hasData: Boolean(
        env.GOOGLE_ROUTES_API_KEY,
      ),
      linesCount: 0,
      linesWithRouteDataCount: 0,
      source: env.GOOGLE_ROUTES_API_KEY
        ? 'google-routes'
        : null,
      stopsCount: geoJsonStopCount(),
      importedAt: null,
      provider: 'google-routes',
    };
  }

  async searchRoutes(
    query: SearchRoutesQueryInput,
  ): Promise<RouteOption[]> {
    if (!env.GOOGLE_ROUTES_API_KEY) {
      return [];
    }

    const cacheKey = [
      query.originLat.toFixed(5),
      query.originLng.toFixed(5),
      query.destinationLat.toFixed(5),
      query.destinationLng.toFixed(5),
    ].join(':');
    const cached = this.routeSearchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.options;
    }

    const inFlight = this.routeSearchInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const requestPromise = this.computeRoutes(query, cacheKey);
    this.routeSearchInFlight.set(cacheKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      this.routeSearchInFlight.delete(cacheKey);
    }
  }

  private async computeRoutes(
    query: SearchRoutesQueryInput,
    cacheKey: string,
  ): Promise<RouteOption[]> {
    const startedAt = Date.now();
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(
        GOOGLE_ROUTES_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key':
              env.GOOGLE_ROUTES_API_KEY,
            'X-Goog-FieldMask':
              GOOGLE_FIELD_MASK,
          },

          body: JSON.stringify({
            origin: {
              location: {
                latLng: {
                  latitude: query.originLat,
                  longitude: query.originLng,
                },
              },
            },

            destination: {
              location: {
                latLng: {
                  latitude: query.destinationLat,
                  longitude: query.destinationLng,
                },
              },
            },

            travelMode: 'TRANSIT',

            computeAlternativeRoutes: true,

            departureTime:
              new Date().toISOString(),

            languageCode: 'pt-BR',

            regionCode: 'BR',

            transitPreferences: {
              allowedTravelModes: ['BUS'],
              routingPreference: 'LESS_WALKING',
            },
          }),

          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const body = await response
          .text()
          .catch(() => '');

        console.error(
          `[GoogleRoutes] HTTP ${response.status}: ${body.slice(
            0,
            1000,
          )}`,
        );

        throw new Error(
          `Google Routes respondeu HTTP ${response.status}. Consulte o terminal do backend para o detalhe da API.`,
        );
      }

      const body =
        (await response.json()) as GoogleResponse;

      console.info(`[GoogleRoutes] resposta recebida em ${Date.now() - startedAt}ms.`);

      const routes = Array.isArray(body.routes)
        ? body.routes
        : [];

      console.info(
        `[GoogleRoutes] ${routes.length} rota(s) retornada(s) pela Routes API.`,
      );

      const options: RouteOption[] = [];

      for (const route of routes) {
        const seconds = durationSeconds(
          route.duration,
        );

        if (!seconds) {
          continue;
        }

        const transitSteps = (
          route.legs ?? []
        )
          .flatMap(
            (leg) => leg.steps ?? [],
          )
          .filter(
            (step) =>
              step.travelMode ===
                'TRANSIT' &&
              step.transitDetails
                ?.transitLine,
          );

        if (transitSteps.length === 0) {
          continue;
        }

        /**
         * O contrato atual do app representa uma
         * linha por opção.
         *
         * Se a rota exigir troca de ônibus/linha,
         * não reduzimos uma viagem de duas linhas
         * a uma linha falsa.
         */
        const distinctLineIds = new Set(
          transitSteps
            .map((step) =>
              lineBaseKey(
                step.transitDetails!
                  .transitLine!,
              ),
            )
            .filter(Boolean),
        );

        if (distinctLineIds.size !== 1) {
          continue;
        }

        const firstStep = transitSteps[0];

        const lastStep =
          transitSteps[
            transitSteps.length - 1
          ];

        const details =
          firstStep.transitDetails!;

        const lastDetails =
          lastStep.transitDetails!;

        const line =
          details.transitLine!;

        const boarding =
          stopFromGoogle(
            details.stopDetails
              ?.departureStop,
            'Parada de embarque',
          );

        const alighting =
          stopFromGoogle(
            lastDetails.stopDetails
              ?.arrivalStop,
            'Parada de desembarque',
          );

        const code =
          line.nameShort?.trim() ||
          line.name?.trim();

        const name =
          line.name?.trim() || code;

        if (
          !boarding ||
          !alighting ||
          !code ||
          !name
        ) {
          continue;
        }

        /**
         * IMPORTANTE:
         * departure precisa ser declarado antes
         * de ser usado em stableOptionKey.
         */
        const departure =
          details.stopDetails
            ?.departureTime;

        const id = stableOptionKey(
          line,

          {
            latitude:
              boarding.latitude,
            longitude:
              boarding.longitude,
          },

          {
            latitude:
              alighting.latitude,
            longitude:
              alighting.longitude,
          },

          departure,
        );

        if (!id) {
          continue;
        }

        /**
         * Evita duplicar exatamente a mesma
         * alternativa caso a API retorne o
         * mesmo trecho mais de uma vez.
         *
         * Alternativas reais da mesma linha
         * continuam distintas quando mudam
         * parada ou horário.
         */
        if (
          options.some(
            (option) =>
              option.lineId === id,
          )
        ) {
          continue;
        }

        const nextDeparture =
          timeHHMM(departure);

        const stopCount =
          transitSteps.reduce(
            (total, current) => {
              const value =
                current.transitDetails
                  ?.stopCount;

              return (
                total +
                (typeof value ===
                  'number' &&
                value > 0
                  ? Math.trunc(value)
                  : 0)
              );
            },
            0,
          );

        const detailedStops = transitSteps
          .flatMap((step) => {
            const details = step.transitDetails;
            const departureStop = stopFromGoogle(details?.stopDetails?.departureStop, 'Parada de embarque');
            const arrivalStop = stopFromGoogle(details?.stopDetails?.arrivalStop, 'Parada de desembarque');
            return [departureStop, arrivalStop];
          })
          .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop))
          .filter((stop, index, all) => index === 0 || stop.id !== all[index - 1].id);

        const firstDepartureMs = departure ? new Date(departure).getTime() : NaN;
        let stops = detailedStops.map((stop, index) => {
          const step = transitSteps[Math.min(index, transitSteps.length - 1)];
          const timestamp = index === 0
            ? departure
            : step.transitDetails?.stopDetails?.arrivalTime || step.transitDetails?.stopDetails?.departureTime;
          const timestampMs = timestamp ? new Date(timestamp).getTime() : NaN;
          const minutesFromStart = Number.isFinite(firstDepartureMs) && Number.isFinite(timestampMs)
            ? Math.max(0, Math.round((timestampMs - firstDepartureMs) / 60000))
            : Math.round((seconds / 60) * (index / Math.max(1, detailedStops.length - 1)));
          return {
            sequence: index + 1,
            minutesFromStart,
            stop: {
              id: stop.id,
              name: stop.name,
              latitude: stop.latitude,
              longitude: stop.longitude,
            },
          };
        });

        let shape = route.polyline?.encodedPolyline
          ? decodeGooglePolyline(route.polyline.encodedPolyline)
          : transitSteps
              .flatMap((step) => [
                step.startLocation?.latLng && validCoordinate(step.startLocation.latLng.latitude) && validCoordinate(step.startLocation.latLng.longitude)
                  ? { latitude: step.startLocation.latLng.latitude!, longitude: step.startLocation.latLng.longitude! }
                  : null,
                step.endLocation?.latLng && validCoordinate(step.endLocation.latLng.latitude) && validCoordinate(step.endLocation.latLng.longitude)
                  ? { latitude: step.endLocation.latLng.latitude!, longitude: step.endLocation.latLng.longitude! }
                  : null,
              ])
              .filter((point): point is { latitude: number; longitude: number } => Boolean(point));

        // A resposta da Google já contém o necessário para abrir a rota.
        // O enriquecimento com stop_times/shape do GTFS é pesado para a busca
        // e não deve bloquear a primeira pintura da tela. Guardamos primeiro
        // o detalhe rápido e enriquecemos em background; se o usuário tocar
        // imediatamente, a tela abre com os dados da Google.
        const fastDetail: LineDetail = {
          id,
          code,
          name,
          stops: stops.length >= 2 ? stops : [
            { sequence: 1, minutesFromStart: 0, stop: boarding },
            { sequence: 2, minutesFromStart: Math.max(1, Math.round(seconds / 60)), stop: alighting },
          ],
          shape: shape.length >= 2 ? shape : [boarding, alighting],
          status: 'OPERATIONAL',
          delayMinutes: null,
          statusReason: 'Dados de rota calculados pela Google Routes API.',
          hasRouteData: true,
          officialSourceUrl: null,
        };
        this.googleLineDetails.set(id, fastDetail);

        void this.gtfsProvider.getTripSegmentByLineCode(
          code,
          { latitude: boarding.latitude, longitude: boarding.longitude },
          { latitude: alighting.latitude, longitude: alighting.longitude },
        ).then((gtfsSegment) => {
          if (!gtfsSegment?.stops?.length || gtfsSegment.stops.length < 2) return;
          const enriched: LineDetail = {
            ...fastDetail,
            stops: gtfsSegment.stops,
            shape: gtfsSegment.shape && gtfsSegment.shape.length >= 2 ? gtfsSegment.shape : fastDetail.shape,
          };
          this.googleLineDetails.set(id, enriched);
        }).catch(() => undefined);


        options.push({
          lineId: id,
          lineCode: code,
          lineName: name,

          boardingStop: boarding,

          alightingStop: alighting,

          stopsCount: stopCount,

          durationMinutes: Math.max(
            1,
            Math.round(
              seconds / 60,
            ),
          ),

          nextDeparture,
          shape: shape.length >= 2 ? shape : [boarding, alighting],
          stops: stops.map((item) => ({
            sequence: item.sequence,
            minutesFromStart: item.minutesFromStart,
            stop: item.stop,
          })),
        });
      }

      console.info(
        `[GoogleRoutes] ${options.length} opção(ões) diretas de ônibus convertidas para o contrato do GuiaMobi em ${Date.now() - startedAt}ms.`
      );
      this.routeSearchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, options });

      return options;
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchLines(
    term: string,
  ): Promise<LineSearchResult[]> {
    const normalizedTerm = term.trim().toLowerCase();
    const cached = this.lineSearchCache.get(normalizedTerm);
    if (cached && cached.expiresAt > Date.now()) return cached.lines;
    /**
     * Routes API calcula viagens.
     *
     * O catálogo continua vindo do GTFS
     * local quando disponível ou da base
     * de linhas já existente para preservar
     * a busca atual.
     */
    const provider = await this.catalogProvider();

    // O catálogo de linhas muda raramente. Depois da primeira carga, a busca
    // por número/nome acontece em memória e não faz uma consulta ILIKE ao
    // PostgreSQL a cada tecla/abertura da tela.
    let catalog = this.officialCatalogCache;
    if (!catalog || catalog.expiresAt <= Date.now()) {
      if (provider === this.gtfsProvider) {
        const rows = await prisma.transitLine.findMany({
          where: { dataSource: 'OFFICIAL_GTFS' },
          select: { id: true, code: true, name: true, officialSourceUrl: true, status: true, _count: { select: { trips: true } } },
          orderBy: { code: 'asc' },
        });
        catalog = {
          expiresAt: Date.now() + 10 * 60_000,
          lines: rows.map((line) => ({
            lineId: line.id,
            lineCode: line.code,
            lineName: line.name,
            status: (line.status?.status ?? 'OPERATIONAL') as LineSearchResult['status'],
            delayMinutes: line.status?.status === 'DELAYED' ? line.status.delayMinutes ?? null : null,
            hasRouteData: line._count.trips > 0,
            officialSourceUrl: line.officialSourceUrl,
          })),
        };
        this.officialCatalogCache = catalog;
      } else {
        const lines = await provider.searchLines(term);
        this.lineSearchCache.set(normalizedTerm, { expiresAt: Date.now() + LINE_SEARCH_CACHE_TTL_MS, lines });
        return lines;
      }
    }

    const query = normalizedTerm;
    const lines = catalog.lines.filter((line) =>
      line.lineCode.toLowerCase().includes(query) || line.lineName.toLowerCase().includes(query),
    ).slice(0, 50);
    this.lineSearchCache.set(normalizedTerm, { expiresAt: Date.now() + LINE_SEARCH_CACHE_TTL_MS, lines });
    return lines;
  }

  async getLineDetail(
    lineId: string,
  ): Promise<LineDetail | null> {
    const cached = this.lineDetailCache.get(lineId);
    if (cached && cached.expiresAt > Date.now()) return cached.line;

    const googleDetail =
      this.googleLineDetails.get(
        lineId,
      );

    if (googleDetail) {
      this.lineDetailCache.set(lineId, { expiresAt: Date.now() + LINE_DETAIL_CACHE_TTL_MS, line: googleDetail });
      return googleDetail;
    }

    /**
     * A busca por linha continua dependendo
     * de GTFS/catálogo local.
     */
    const provider =
      await this.catalogProvider();

    const line = await provider.getLineDetail(lineId);
    this.lineDetailCache.set(lineId, { expiresAt: Date.now() + LINE_DETAIL_CACHE_TTL_MS, line });
    return line;
  }

  async linesNearPoint(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<NearbyLine[]> {
    const provider =
      await this.catalogProvider();

    return provider.linesNearPoint(
      latitude,
      longitude,
      radiusMeters,
    );
  }
}