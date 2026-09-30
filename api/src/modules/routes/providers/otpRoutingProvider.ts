import { env } from '../../../config/env';
import {
  LineDetail,
  LineSearchResult,
  NearbyLine,
  RouteOption,
  SearchRoutesQueryInput,
  TransitProvider,
  TransitStatus,
} from './types';

/**
 * Provider que delega o cálculo de rota a uma instância própria do
 * OpenTripPlanner (OTP) via GraphQL, quando `OTP_URL` está configurada.
 *
 * IMPORTANTE: OTP é só o MOTOR de roteamento - ele não tem dados de SJC por
 * si só. Para este provider retornar algo além de "sem dados", a instância
 * de OTP apontada por OTP_URL precisa ter sido iniciada com:
 *   1) um extrato OpenStreetMap da região de São José dos Campos (rede
 *      viária, para calcular caminhada até o ponto), e
 *   2) o GTFS oficial de SJC (para linhas/paradas/horários).
 * Ver api/src/integrations/transit/README.md para um docker-compose de
 * referência. Sem OTP_URL configurada, este provider nunca é selecionado
 * (ver providers/index.ts) - não há chamada de rede nem dado inventado.
 *
 * Não testado neste ambiente por não haver uma instância de OTP disponível;
 * a implementação segue a API GraphQL pública e estável do OTP 2.x
 * (documentação: https://docs.opentripplanner.org/en/latest/apis/GraphQL-Tutorial/).
 */
export class OtpRoutingProvider implements TransitProvider {
  readonly name = 'otp' as const;

  private get baseUrl(): string {
    if (!env.OTP_URL) {
      throw new Error('OtpRoutingProvider usado sem OTP_URL configurada.');
    }
    return env.OTP_URL.replace(/\/$/, '');
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/otp/routers/default/index/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      // OTP pode demorar em buscas complexas; falha rápido em vez de travar a requisição do app.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`OTP respondeu ${response.status}`);
    }

    const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) {
      throw new Error(`OTP GraphQL error: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    if (!body.data) {
      throw new Error('OTP retornou resposta sem "data".');
    }
    return body.data;
  }

  async getStatus(): Promise<TransitStatus> {
    try {
      const data = await this.graphql<{ feeds: { feedId: string }[]; agencies: { gtfsId: string }[] }>(
        `query { feeds { feedId } agencies { gtfsId } }`,
        {}
      );
      const hasData = (data.feeds?.length ?? 0) > 0;
      return {
        hasData,
        linesCount: -1, // OTP não expõe uma contagem simples de "linhas" nesta consulta; ver getLineDetail/searchLines para números reais
        linesWithRouteDataCount: -1,
        source: hasData ? 'opentripplanner' : null,
        stopsCount: -1,
        importedAt: null,
        provider: 'otp',
      };
    } catch {
      return {
        hasData: false,
        linesCount: 0,
        linesWithRouteDataCount: 0,
        source: null,
        stopsCount: 0,
        importedAt: null,
        provider: 'otp',
      };
    }
  }

  async searchRoutes(query: SearchRoutesQueryInput): Promise<RouteOption[]> {
    const nowIso = new Date().toISOString();

    interface OtpPlanResponse {
      plan: {
        itineraries: {
          duration: number; // segundos
          legs: {
            mode: string;
            route?: { shortName?: string; longName?: string; gtfsId: string };
            from: { name: string; lat: number; lon: number; stop?: { gtfsId: string } };
            to: { name: string; lat: number; lon: number; stop?: { gtfsId: string } };
            startTime: number; // epoch ms
            legGeometry?: { points: string }; // polyline codificada (mesmo formato do Google)
          }[];
        }[];
      };
    }

    const data = await this.graphql<OtpPlanResponse>(
      `query Plan($from: InputCoordinates!, $to: InputCoordinates!, $date: String!, $time: String!) {
        plan(from: $from, to: $to, date: $date, time: $time, numItineraries: 5, transportModes: [{mode: WALK}, {mode: TRANSIT}]) {
          itineraries {
            duration
            legs {
              mode
              route { shortName longName gtfsId }
              from { name lat lon stop { gtfsId } }
              to { name lat lon stop { gtfsId } }
              startTime
              legGeometry { points }
            }
          }
        }
      }`,
      {
        from: { lat: query.originLat, lon: query.originLng },
        to: { lat: query.destinationLat, lon: query.destinationLng },
        date: nowIso.slice(0, 10),
        time: nowIso.slice(11, 16),
      }
    );

    const options: RouteOption[] = [];

    for (const itinerary of data.plan.itineraries) {
      const transitLeg = itinerary.legs.find((leg) => leg.mode !== 'WALK');
      if (!transitLeg || !transitLeg.route) continue; // itinerário só a pé não é uma "linha"

      options.push({
        lineId: transitLeg.route.gtfsId,
        lineCode: transitLeg.route.shortName ?? transitLeg.route.gtfsId,
        lineName: transitLeg.route.longName ?? transitLeg.route.shortName ?? transitLeg.route.gtfsId,
        boardingStop: {
          id: transitLeg.from.stop?.gtfsId ?? transitLeg.from.name,
          name: transitLeg.from.name,
          distanceMeters: 0, // OTP já contabiliza a caminhada na duração total; não recalculamos por fora
          latitude: transitLeg.from.lat,
          longitude: transitLeg.from.lon,
        },
        alightingStop: {
          id: transitLeg.to.stop?.gtfsId ?? transitLeg.to.name,
          name: transitLeg.to.name,
          distanceMeters: 0,
          latitude: transitLeg.to.lat,
          longitude: transitLeg.to.lon,
        },
        stopsCount: 0, // não fornecido diretamente pela consulta acima
        durationMinutes: Math.round(itinerary.duration / 60),
        nextDeparture: new Date(transitLeg.startTime).toISOString().slice(11, 16),
        shape: transitLeg.legGeometry ? decodePolyline(transitLeg.legGeometry.points) : undefined,
      });
    }

    return options.sort((a, b) => a.durationMinutes - b.durationMinutes);
  }

  async searchLines(term: string): Promise<LineSearchResult[]> {
    const data = await this.graphql<{ routes: { gtfsId: string; shortName?: string; longName?: string }[] }>(
      `query { routes { gtfsId shortName longName } }`,
      {}
    );

    const lower = term.toLowerCase();
    return data.routes
      .filter((r) => (r.shortName ?? '').toLowerCase().includes(lower) || (r.longName ?? '').toLowerCase().includes(lower))
      .slice(0, 50)
      .map((r) => ({
        lineId: r.gtfsId,
        lineCode: r.shortName ?? r.gtfsId,
        lineName: r.longName ?? r.shortName ?? r.gtfsId,
        status: 'OPERATIONAL' as const,
        delayMinutes: null,
        hasRouteData: true,
        officialSourceUrl: null,
      }));
  }

  async linesNearPoint(_latitude: number, _longitude: number, _radiusMeters: number): Promise<NearbyLine[]> {
    // Não implementado para OTP nesta fase (exigiria a consulta "stopsByRadius" + "stoptimesWithoutPatterns"
    // e este provider ainda não está em uso). Retorna vazio em vez de inventar.
    return [];
  }

  async getLineDetail(lineId: string): Promise<LineDetail | null> {
    interface OtpRouteResponse {
      route: {
        gtfsId: string;
        shortName?: string;
        longName?: string;
        patterns: { stops: { gtfsId: string; name: string; lat: number; lon: number }[] }[];
      } | null;
    }

    const data = await this.graphql<OtpRouteResponse>(
      `query Route($id: String!) {
        route(id: $id) {
          gtfsId shortName longName
          patterns { stops { gtfsId name lat lon } }
        }
      }`,
      { id: lineId }
    );

    if (!data.route) return null;
    const representativePattern = data.route.patterns.sort((a, b) => b.stops.length - a.stops.length)[0];

    return {
      id: data.route.gtfsId,
      code: data.route.shortName ?? data.route.gtfsId,
      name: data.route.longName ?? data.route.shortName ?? data.route.gtfsId,
      stops: (representativePattern?.stops ?? []).map((s, index) => ({
        sequence: index,
        // TODO: o horário por parada exigiria uma consulta OTP adicional
        // (stoptimesForPatternAtStop); como este provider ainda não está em
        // uso (ver providers/index.ts), não implementamos agora para não
        // gastar tempo em um caminho não testável neste momento.
        minutesFromStart: 0,
        stop: { id: s.gtfsId, name: s.name, latitude: s.lat, longitude: s.lon },
      })),
      status: 'OPERATIONAL',
      delayMinutes: null,
      statusReason: null,
      hasRouteData: (representativePattern?.stops.length ?? 0) > 0,
      officialSourceUrl: null,
    };
  }
}

/** Decodifica uma polyline no formato padrão do Google/OTP (precisão 1e-5). */
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}
