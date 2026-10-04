/**
 * Subconjunto de trajetos usados pela fixture de desenvolvimento da US06.
 *
 * Os nomes das linhas, itinerários e horários abaixo são baseados nas
 * publicações oficiais da Prefeitura de São José dos Campos. As coordenadas
 * de pontos que não possuem coordenada oficial estruturada no PDF são
 * aproximações geográficas usadas SOMENTE para permitir o teste de busca
 * origem/destino no mock.
 *
 * Fontes oficiais dos PDFs:
 * 101: https://www.sjc.sp.gov.br/media/spaelypb/101-48_site.pdf
 * 121: https://www.sjc.sp.gov.br/media/nqdhjttk/121-68_site.pdf
 * 128: https://www.sjc.sp.gov.br/media/t2knojrt/128-40_site.pdf
 *
 * Importante: duração e minutos entre pontos são estimativas da fixture,
 * calculadas pela distância geográfica. Não são tempos oficiais de viagem.
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
  latitude: -23.17898,
  longitude: -45.88853,
  source: 'Coordenada aproximada de referência do Terminal Central baseada em OpenStreetMap/Mapcarta; usada apenas pela fixture.',
};

const AVENIDA_SAO_JOSE: RealStop = {
  name: 'Av. São José',
  latitude: -23.17925,
  longitude: -45.88877,
  source: 'Coordenada aproximada da Avenida São José baseada em bases públicas de endereçamento; o PDF oficial confirma a via no itinerário.',
};

const PRACA_AFONSO_PENA: RealStop = {
  name: 'Praça Afonso Pena',
  latitude: -23.1825,
  longitude: -45.8841,
  source: 'Coordenada de referência usada na fixture, próxima ao ponto central; o PDF oficial confirma a praça no itinerário das linhas 121/128.',
};

const PRACA_BANDEIRANTES: RealStop = {
  name: 'Praça Bandeirantes',
  latitude: -23.15583,
  longitude: -45.89742,
  source: 'Coordenada de referência pública do endereço da Praça Bandeirantes; o PDF oficial da linha 101 confirma a praça no itinerário.',
};

const ESTRADA_JUCA_CARVALHO: RealStop = {
  name: 'Estrada Juca Carvalho',
  latitude: -23.14378,
  longitude: -45.90476,
  source: 'Coordenada aproximada próxima a pontos de ônibus mapeados no OSM; o PDF oficial da linha 101 confirma a via no itinerário.',
};

const RIO_DAS_COBRAS: RealStop = {
  name: 'Rio das Cobras',
  latitude: -23.14473,
  longitude: -45.91256,
  source: 'Coordenada de referência pública para Rua Rio das Cobras; o PDF oficial da linha 101 confirma o bairro no itinerário.',
};

const PRACA_FUKUOKA: RealStop = {
  name: 'Praça Fukuoka',
  latitude: -23.1953,
  longitude: -45.9326,
  source: 'Coordenada pública de referência da Praça Fukuoka; o PDF oficial das linhas 121/128 confirma a praça no itinerário.',
};

const AVENIDA_LINEU_MOURA: RealStop = {
  name: 'Av. Lineu de Moura',
  latitude: -23.1914965,
  longitude: -45.9209737,
  source: 'Coordenada pública de referência da Avenida Lineu de Moura; o PDF oficial das linhas 121/128 confirma a via no itinerário.',
};

const AVENIDA_SHISHIMA_HIFUMI: RealStop = {
  name: 'Av. Shishima Hifumi',
  latitude: -23.2002794,
  longitude: -45.9370564,
  source: 'Coordenada pública de referência da Avenida Shishima Hifumi; o PDF oficial das linhas 121/128 confirma a via no itinerário.',
};

const PRACA_NICOLAU_DIACOV: RealStop = {
  name: 'Praça Nicolau Diacov (PED O-180)',
  latitude: -23.2022229,
  longitude: -45.9552462,
  source: 'Coordenada de referência de ponto de ônibus O-180 mapeado no OSM; o PDF oficial das linhas 121/128 identifica a Praça Nicolau Diacov/PED O-180.',
};

const AVENIDA_PAPA_JOAO_PAULO_II: RealStop = {
  name: 'Av. Papa João Paulo II',
  latitude: -23.203622,
  longitude: -45.950134,
  source: 'Coordenada pública de referência em Avenida Papa João Paulo II, Urbanova; o PDF oficial da linha 128 confirma a via no itinerário.',
};

const URBANOVA: RealStop = {
  name: 'Urbanova',
  latitude: -23.20353,
  longitude: -45.95502,
  source: 'Coordenada de referência pública de endereço em Urbanova; o PDF oficial identifica Urbanova como área atendida.',
};

export interface RealLineRoute {
  code: string;
  destinationStop: RealStop;
  intermediateStops?: RealStop[];
  /** Horários reais de partida do sentido Centro/Terminal, selecionados do PDF oficial. */
  weekdayDepartures?: string[];
  sourceUrl: string;
}

export const REAL_LINE_ROUTES: RealLineRoute[] = [
  {
    code: '101',
    destinationStop: RIO_DAS_COBRAS,
    intermediateStops: [AVENIDA_SAO_JOSE, PRACA_BANDEIRANTES, ESTRADA_JUCA_CARVALHO],
    weekdayDepartures: ['04:20', '07:50', '10:20', '13:20', '16:20', '17:40', '19:05', '23:00'],
    sourceUrl: 'https://www.sjc.sp.gov.br/media/spaelypb/101-48_site.pdf',
  },
  {
    code: '121',
    destinationStop: URBANOVA,
    intermediateStops: [AVENIDA_SAO_JOSE, PRACA_AFONSO_PENA, AVENIDA_LINEU_MOURA, PRACA_FUKUOKA, AVENIDA_SHISHIMA_HIFUMI, PRACA_NICOLAU_DIACOV],
    // Partidas do sentido Centro do OSO 68; selecionadas para manter a fixture compacta.
    weekdayDepartures: ['05:40', '06:05', '07:24', '08:00', '09:01', '10:15', '11:35', '12:15', '13:35', '14:15', '15:06', '16:02', '17:05', '18:13', '19:10', '20:10', '21:20', '22:20', '23:20'],
    sourceUrl: 'https://www.sjc.sp.gov.br/media/nqdhjttk/121-68_site.pdf',
  },
  {
    code: '128',
    destinationStop: URBANOVA,
    intermediateStops: [AVENIDA_SAO_JOSE, PRACA_AFONSO_PENA, AVENIDA_LINEU_MOURA, PRACA_FUKUOKA, AVENIDA_SHISHIMA_HIFUMI, AVENIDA_PAPA_JOAO_PAULO_II, PRACA_NICOLAU_DIACOV],
    // Partidas do sentido Centro do OSO 40; selecionadas para manter a fixture compacta.
    weekdayDepartures: ['05:55', '06:15', '07:05', '08:06', '09:25', '10:35', '11:15', '12:35', '13:15', '14:23', '15:14', '16:05', '17:13', '18:04', '19:00', '20:40', '21:40', '22:00', '23:10'],
    sourceUrl: 'https://www.sjc.sp.gov.br/media/t2knojrt/128-40_site.pdf',
  },
  {
    code: '323',
    destinationStop: {
      name: 'Campo dos Alemães (Av. Maria de Lourdes M. de Assis x Av. Adilson José da Cruz)',
      latitude: -23.27128,
      longitude: -45.88724,
      source:
        'Ponto geodésico oficial "M29" (SIRGAS2000, INPE/Prefeitura de SJC), dez/2017: https://www.sjc.sp.gov.br/media/43763/m29.pdf',
    },
    weekdayDepartures: [
      '06:00', '07:40', '08:10', '08:40', '09:30', '10:10', '10:45', '11:15', '11:40', '12:10',
      '12:50', '13:25', '13:40', '14:10', '14:45', '15:20', '15:40', '16:15', '16:50', '17:30',
      '18:00', '18:35', '19:20', '20:10', '20:40', '21:10', '21:50', '22:45', '23:25',
      '05:00', '05:25', '05:55', '06:25', '06:45', '07:10', '07:40', '08:25', '09:00', '09:30',
      '10:10', '10:50', '11:30', '12:00', '12:20', '12:50', '13:30', '14:05', '14:20', '14:50',
      '15:30', '16:10', '16:30', '17:05', '17:45', '18:20', '18:50', '19:25', '20:05', '21:20',
      '21:50', '22:30',
    ],
    sourceUrl: 'https://www.sjc.sp.gov.br/media/rddfbq2o/323-53f.pdf',
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
    sourceUrl: 'https://sjc.sp.gov.br/media/ztjn2bqp/103-66_site.pdf',
  },
];
