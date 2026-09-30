/**
 * Tipos das rotas de navegação, usados pelo React Navigation para checar
 * em tempo de compilação os parâmetros passados entre telas.
 */

export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  // Alcançável pelo link do e-mail (deep link) ou manualmente a partir de ForgotPassword
  ResetPassword: { token?: string } | undefined;
};

export type AppTabParamList = {
  Home: undefined;
  Routes: undefined;
  Favorites: undefined;
  History: undefined;
  Settings: undefined;
};

// Ponto de origem/destino, usado para navegar entre Home -> Rotas encontradas
export interface RouteSearchPoint {
  label: string;
  latitude: number;
  longitude: number;
}

export interface RouteDetailParams {
  lineId: string;
  lineCode: string;
  lineName: string;
  boardingStopId?: string;
  alightingStopId?: string;
  durationMinutes?: number;
  stopsCount?: number;
  nextDeparture?: string | null;
  destinationLabel?: string;
}

export interface TripSummary {
  lineCode: string;
  lineName: string;
  destinationLabel: string;
  durationMinutes: number | null;
  stopsCount: number | null;
  startedAt: string;
}

// Pilha que envolve as abas principais, permitindo empilhar telas que não
// são abas (busca de endereço, rotas, viagem, ajuda, perfil, tutorial).
export type AppStackParamList = {
  MainTabs: { screen?: keyof AppTabParamList } | undefined;
  PlaceSearch: { field: 'origin' | 'destination' };
  RoutesFound: { origin: RouteSearchPoint; destination: RouteSearchPoint; historyId?: string };
  RouteDetail: RouteDetailParams;
  Tracking: RouteDetailParams & { boardingStopId: string; alightingStopId: string };
  StopAlert: { stopName: string };
  Arrival: { placeName: string; trip: TripSummary };
  AddFavorite: undefined;
  // openKey abre direto uma pergunta (ex.: a Política de Privacidade, a partir do cadastro)
  Help: { openKey?: string } | undefined;
  EditProfile: undefined;
  Tutorial: { firstAccess?: boolean } | undefined;
};
