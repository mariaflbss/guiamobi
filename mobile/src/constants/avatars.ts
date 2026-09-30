/**
 * Avatares do perfil. São apenas opções visuais: qualquer pessoa pode
 * escolher qualquer um, e nenhum representa uma condição ou deficiência.
 * Os que lembram bengalas são inspirados em elementos de acessibilidade.
 * Cada avatar tem uma descrição acessível em avatars.<id> (i18n).
 */
export const AVATAR_IDS = [
  'dog',
  'cat',
  'owl',
  'bear',
  'fox',
  'person',
  'robot',
  'bus',
  'whiteCane',
  'greenCane',
  'redWhiteCane',
  'star',
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export function isAvatarId(value: string | null | undefined): value is AvatarId {
  return Boolean(value) && (AVATAR_IDS as readonly string[]).includes(value as string);
}
