import { prisma } from '../../../database/prisma';
import { env } from '../../../config/env';
import { DevFixtureProvider } from './devFixtureProvider';
import { GtfsDatabaseProvider } from './gtfsDatabaseProvider';
import { OtpRoutingProvider } from './otpRoutingProvider';
import { TransitProvider } from './types';
import { GoogleRoutesProvider } from './googleRoutesProvider';

const devFixtureProvider = new DevFixtureProvider();
const gtfsDatabaseProvider = new GtfsDatabaseProvider();
const otpRoutingProvider = env.OTP_URL ? new OtpRoutingProvider() : null;
const googleRoutesProvider = env.GOOGLE_ROUTES_API_KEY ? new GoogleRoutesProvider() : null;

/**
 * Escolhe qual TransitProvider atende a requisição atual, na ordem pedida
 * pela auditoria: OpenTripPlanner (se configurado) > GTFS oficial importado
 * > fixture de desenvolvimento. Isso roda a cada requisição (não é fixado no
 * boot) para que importar um GTFS ou configurar o OTP passe a valer
 * imediatamente, sem reiniciar a API.
 *
 * `TRANSIT_PROVIDER` no .env pode forçar um provider específico (útil para
 * testes); o padrão é "auto".
 */
export async function selectTransitProvider(): Promise<TransitProvider> {
  if (env.TRANSIT_PROVIDER === 'google' && googleRoutesProvider) return googleRoutesProvider;
  if (env.TRANSIT_PROVIDER === 'otp' && otpRoutingProvider) return otpRoutingProvider;
  if (env.TRANSIT_PROVIDER === 'gtfs') return gtfsDatabaseProvider;
  if (env.TRANSIT_PROVIDER === 'dev') return devFixtureProvider;

  // auto: Google Routes é a primeira fonte para cálculo de viagens quando configurada.
  // Catálogo/detalhe continuam dependendo de GTFS/fixture pelos métodos específicos.
  if (googleRoutesProvider) return googleRoutesProvider;

  if (otpRoutingProvider) {
    const status = await otpRoutingProvider.getStatus();
    if (status.hasData) return otpRoutingProvider;
  }

  const gtfsLinesCount = await prisma.transitLine.count({ where: { dataSource: 'OFFICIAL_GTFS' } });
  if (gtfsLinesCount > 0) return gtfsDatabaseProvider;

  return devFixtureProvider;
}
