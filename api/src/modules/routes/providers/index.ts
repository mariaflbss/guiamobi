import { prisma } from '../../../database/prisma';
import { env } from '../../../config/env';
import { DevFixtureProvider } from './devFixtureProvider';
import { GtfsDatabaseProvider } from './gtfsDatabaseProvider';
import { OtpRoutingProvider } from './otpRoutingProvider';
import { TransitProvider } from './types';

const devFixtureProvider = new DevFixtureProvider();
const gtfsDatabaseProvider = new GtfsDatabaseProvider();
const otpRoutingProvider = env.OTP_URL ? new OtpRoutingProvider() : null;

/**
 * Escolhe qual TransitProvider atende a requisição atual. O GTFS oficial
 * importado é a fonte principal quando existe; OTP continua disponível apenas
 * como fallback opcional. A seleção roda a cada requisição para que uma nova
 * importação de GTFS passe a valer sem reiniciar a API.
 *
 * `TRANSIT_PROVIDER` no .env pode forçar um provider específico (útil para
 * testes); o padrão é "auto".
 */
export async function selectTransitProvider(): Promise<TransitProvider> {
  if (env.TRANSIT_PROVIDER === 'otp' && otpRoutingProvider) return otpRoutingProvider;
  if (env.TRANSIT_PROVIDER === 'gtfs') return gtfsDatabaseProvider;
  if (env.TRANSIT_PROVIDER === 'dev') return devFixtureProvider;

  // auto: o GTFS oficial local é a fonte principal. OTP permanece disponível
  // apenas como fallback explícito para ambientes que já o utilizam.
  const gtfsLinesCount = await prisma.transitLine.count({ where: { dataSource: 'OFFICIAL_GTFS' } });
  if (gtfsLinesCount > 0) return gtfsDatabaseProvider;

  if (otpRoutingProvider) {
    const status = await otpRoutingProvider.getStatus();
    if (status.hasData) return otpRoutingProvider;
  }

  return devFixtureProvider;
}
