// Tipos relacionados a favoritos e histórico (US07)
import { Coordinates } from './location';

export type FavoriteKind = 'home' | 'school' | 'work' | 'health' | 'other';

export interface FavoritePlace {
  id: string;
  nickname: string; // apelido definido pelo usuário (ex.: "Casa", "Trabalho")
  address: string;
  latitude: number;
  longitude: number;
  kind: FavoriteKind; // define o ícone/cor do cartão
  createdAt: string;
}

export interface FavoriteLine {
  lineId: string;
  code: string;
  name: string;
}

export interface SearchHistoryItem {
  id: string;
  originLabel: string;
  originLatitude: number;
  originLongitude: number;
  destinationLabel: string;
  destinationLatitude: number;
  destinationLongitude: number;
  searchedAt: string;
  /** Linha escolhida na busca (preenchida quando o usuário abre uma rota). */
  lineCode: string | null;
  durationMinutes: number | null;
}

export interface CreateFavoriteInput {
  nickname: string;
  address: string;
  coordinates: Coordinates;
  kind: FavoriteKind;
}

export interface CreateHistoryInput {
  originLabel: string;
  originCoordinates: Coordinates;
  destinationLabel: string;
  destinationCoordinates: Coordinates;
}
