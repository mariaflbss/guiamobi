/**
 * Paradas/trajeto REAIS para um subconjunto das 100 linhas oficiais.
 *
 * Por que só um subconjunto: os PDFs de horário/itinerário da Prefeitura
 * (ver officialLines.ts) não têm coordenadas, e a tabela de horários de
 * muitos deles não é extraível com segurança como texto simples (grade de
 * minutos por hora sem alinhamento confiável - ver README de
 * api/src/integrations/transit/). Para as linhas abaixo, porém, foi possível
 * reunir dado real e verificável o suficiente para montar um trajeto
 * simplificado (ida e volta entre os dois terminais reais da linha) e, para
 * a linha 323, também os horários de partida reais:
 *
 * - Coordenadas dos bairros: pontos geodésicos oficiais da própria
 *   Prefeitura/INPE (SIRGAS2000), publicados em
 *   https://www.sjc.sp.gov.br/media/... (arquivos "mXX.pdf"/"mcXX.pdf").
 *   Cada `source` abaixo cita o arquivo e o endereço exato do ponto.
 * - Coordenada do Terminal Central: aproximada pela coordenada central do
 *   município de São José dos Campos (Wikipédia/OpenStreetMap,
 *   -23.17889, -45.88694), já que o terminal fica na área central da
 *   cidade; não é um geocode preciso do prédio, e isso está indicado no
 *   `source`.
 * - Itinerário (quais ruas a linha percorre) confirmado a partir do PDF
 *   oficial de cada linha (`officialSourceUrl` em officialLines.ts).
 * - Duração: NÃO veio de um horário oficial (não temos isso para o trajeto
 *   completo) - é uma ESTIMATIVA calculada a partir da distância real entre
 *   os dois pontos (fórmula de Haversine) e uma velocidade média assumida de
 *   ônibus urbano (20 km/h, incluindo paradas e trânsito). Isso é uma
 *   estimativa transparente, não um horário inventado.
 *
 * Isso é deliberadamente uma amostra pequena e verificada, não as 100
 * linhas - ver README de api/src/integrations/transit/ para o importador
 * genérico que processa o restante quando houver acesso de rede a um
 * serviço de geocodificação.
 */

export const AVERAGE_BUS_SPEED_KMH = 20;

export interface RealStop {
  name: string;
  latitude: number;
  longitude: number;
  source: string;
}

export const TERMINAL_CENTRAL: RealStop = {
  name: 'Terminal Central',
  latitude: -23.17889,
  longitude: -45.88694,
  source:
    'Aproximação pela coordenada central do município de São José dos Campos (Wikipédia/OpenStreetMap Wiki, consultado em 26/09/2026) - o Terminal Central fica na área central da cidade; não é um geocode do prédio.',
};

export interface RealLineRoute {
  code: string;
  destinationStop: RealStop;
  /** Horários reais de partida (dias úteis), extraídos do PDF oficial da linha - vazio quando não há fonte confiável. */
  weekdayDepartures?: string[];
}

export const REAL_LINE_ROUTES: RealLineRoute[] = [
  {
    code: '323',
    destinationStop: {
      name: 'Campo dos Alemães (Av. Maria de Lourdes M. de Assis x Av. Adilson José da Cruz)',
      latitude: -23.27128,
      longitude: -45.88724,
      source:
        'Ponto geodésico oficial "M29" (SIRGAS2000, INPE/Prefeitura de SJC), dez/2017: https://www.sjc.sp.gov.br/media/43763/m29.pdf',
    },
    // PDF oficial da linha 323 (ver officialLines.ts), seção "HORÁRIOS - DIAS ÚTEIS".
    // "Partidas do Terminal Central" (29 horários) + "Partidas do Bairro" (32 horários);
    // a contagem impressa no PDF ("(29)"/"(32)") bate com a quantidade de horários
    // listados, o que confirma a extração. O sufixo "AQ" (variação "via Aquárius") do
    // horário 23:25 foi omitido - guardamos só o horário.
    weekdayDepartures: [
      '06:00', '07:40', '08:10', '08:40', '09:30', '10:10', '10:45', '11:15', '11:40', '12:10',
      '12:50', '13:25', '13:40', '14:10', '14:45', '15:20', '15:40', '16:15', '16:50', '17:30',
      '18:00', '18:35', '19:20', '20:10', '20:40', '21:10', '21:50', '22:45', '23:25',
      '05:00', '05:25', '05:55', '06:25', '06:45', '07:10', '07:40', '08:25', '09:00', '09:30',
      '10:10', '10:50', '11:30', '12:00', '12:20', '12:50', '13:30', '14:05', '14:20', '14:50',
      '15:30', '16:10', '16:30', '17:05', '17:45', '18:20', '18:50', '19:25', '20:05', '21:20',
      '21:50', '22:30',
    ],
  },
  {
    code: '128',
    destinationStop: {
      name: 'Urbanova III (Rua Carlos Alberto de Souza x Rua Eduardo Meyer Fleury)',
      latitude: -23.19938,
      longitude: -45.95183,
      source:
        'Ponto geodésico oficial "M23" (SIRGAS2000, INPE/Prefeitura de SJC), dez/2017: https://www.sjc.sp.gov.br/media/43757/m23.pdf',
    },
    // Sem horário confiável extraído para esta linha nesta rodada.
  },
  {
    code: '103',
    destinationStop: {
      name: 'Costinha (Estrada Municipal Rodolfo S. Alvarenga)',
      latitude: -23.09007,
      longitude: -45.92573,
      source:
        'Ponto geodésico oficial "M21" (SIRGAS2000, INPE/Prefeitura de SJC), dez/2017: https://www.sjc.sp.gov.br/media/43755/m21.pdf',
    },
  },
];
