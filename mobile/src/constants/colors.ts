/**
 * Paleta do GuiaMobi Acessível, extraída dos mockups (azul #1852A4, fundo
 * #F5F6FA, verde/âmbar/roxo/vermelho de apoio).
 *
 * Onde a cor exata do mockup não atingia o contraste mínimo de 4,5:1 (texto)
 * ou 3:1 (elementos gráficos) da WCAG 2.1 AA, foi usada a variante mais
 * próxima que atinge - ex.: botão "Entendido!" em #B45309 (o mockup usa um
 * âmbar mais claro, #D97706, com 3,2:1 sobre branco).
 */

export const lightColors = {
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F6FA',
  primary: '#1852A4',
  primaryDark: '#143B7C',
  primarySoft: '#E8EFFF',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: '#DDE6F5',
  headerOverlay: 'rgba(255,255,255,0.18)',
  text: '#101828',
  textSecondary: '#5A6478',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  success: '#15803D',
  successSoft: '#E7F6EC',
  successBg: '#F0FDF4',
  successStrong: '#16A34A',
  successDark: '#166534',
  successButton: '#0F7B55',
  warning: '#B45309',
  warningSoft: '#FFF3E0',
  warningBg: '#FFFBEB',
  warningStrong: '#D97706',
  warningDark: '#7C2D12',
  error: '#B91C1C',
  errorSoft: '#FDECEC',
  errorBackground: '#FBEAE9',
  errorBorder: '#F5B5B5',
  purple: '#6D28D9',
  purpleSoft: '#F1EBFF',
  purpleStrong: '#7C3AED',
  mapBackground: '#DEF0D8',
  mapGrid: '#CFE5C8',
  disabled: '#9AA1AC',
  focus: '#0B5FFF',
  // aliases mantidos por compatibilidade com componentes existentes
  successBackground: '#E7F6EA',
  warningBackground: '#FFF3E0',
};

export const darkColors: ColorPalette = {
  background: '#0E1522',
  surface: '#172033',
  surfaceAlt: '#0E1522',
  primary: '#7FA8FF',
  primaryDark: '#0B2A56',
  primarySoft: '#1B2B4A',
  onPrimary: '#0A1A33',
  onPrimaryMuted: '#C7D6F2',
  headerOverlay: 'rgba(255,255,255,0.14)',
  text: '#F2F4F8',
  textSecondary: '#C0C8D6',
  border: '#2B3650',
  borderStrong: '#3B4866',
  success: '#7FD39A',
  successSoft: '#123319',
  successBg: '#0F2418',
  successStrong: '#3DBA6A',
  successDark: '#9BE3B2',
  successButton: '#1F8F5F',
  warning: '#FFC46B',
  warningSoft: '#332400',
  warningBg: '#241A08',
  warningStrong: '#E8952B',
  warningDark: '#FFD9A0',
  error: '#FF8A80',
  errorSoft: '#3A1512',
  errorBackground: '#3A1512',
  errorBorder: '#7A2F2A',
  purple: '#C4B0FF',
  purpleSoft: '#2A2148',
  purpleStrong: '#9B7BFF',
  mapBackground: '#1B2A22',
  mapGrid: '#24382D',
  disabled: '#5C5F66',
  focus: '#8FB8FF',
  successBackground: '#123319',
  warningBackground: '#332400',
};

export type ColorPalette = typeof lightColors;

/** Cores dos "badges" das linhas de ônibus (branco sobre a cor: contraste ≥ 4,5:1). */
// Ordem escolhida para reproduzir os mockups (301 azul, 315 verde, 320 roxo).
// Todas têm contraste >= 4,5:1 com o texto branco do badge.
export const LINE_BADGE_COLORS = ['#15803D', '#1852A4', '#6D28D9'];
