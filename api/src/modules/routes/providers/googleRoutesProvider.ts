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

const REQUEST_TIMEOUT_MS = 15000;

const GOOGLE_FIELD_MASK = [
  'routes.duration',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.transitDetails',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
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

  private async catalogProvider(): Promise<TransitProvider> {
    const officialLines =
      await prisma.transitLine.count({
        where: {
          dataSource: 'OFFICIAL_GTFS',
        },
      });

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

        this.googleLineDetails.set(
          id,
          {
            id,
            code,
            name,

            stops: [
              {
                sequence: 1,
                minutesFromStart: 0,

                stop: {
                  id: boarding.id,
                  name: boarding.name,
                  latitude:
                    boarding.latitude,
                  longitude:
                    boarding.longitude,
                },
              },

              {
                sequence: 2,

                minutesFromStart:
                  Math.max(
                    1,
                    Math.round(
                      seconds / 60,
                    ),
                  ),

                stop: {
                  id: alighting.id,
                  name: alighting.name,
                  latitude:
                    alighting.latitude,
                  longitude:
                    alighting.longitude,
                },
              },
            ],

            shape: [
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
            ],

            status: 'OPERATIONAL',

            delayMinutes: null,

            statusReason:
              'Dados de rota calculados pela Google Routes API.',

            hasRouteData: true,

            officialSourceUrl: null,
          },
        );

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
        });
      }

      console.info(
        `[GoogleRoutes] ${options.length} opção(ões) diretas de ônibus convertidas para o contrato do GuiaMobi.`,
      );

      return options;
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchLines(
    term: string,
  ): Promise<LineSearchResult[]> {
    /**
     * Routes API calcula viagens.
     *
     * O catálogo continua vindo do GTFS
     * local quando disponível ou da base
     * de linhas já existente para preservar
     * a busca atual.
     */
    const provider =
      await this.catalogProvider();

    return provider.searchLines(term);
  }

  async getLineDetail(
    lineId: string,
  ): Promise<LineDetail | null> {
    const googleDetail =
      this.googleLineDetails.get(
        lineId,
      );

    if (googleDetail) {
      return googleDetail;
    }

    /**
     * A busca por linha continua dependendo
     * de GTFS/catálogo local.
     */
    const provider =
      await this.catalogProvider();

    return provider.getLineDetail(lineId);
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