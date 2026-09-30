import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';
import { AvatarId } from '../constants/avatars';

/**
 * Desenhos vetoriais simples dos avatares (viewBox 100x100). São decorativos:
 * a descrição para leitores de tela é dada por quem usa o componente.
 */
export function AvatarArt({ id, size = 64 }: { id: AvatarId; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {renderArt(id)}
    </Svg>
  );
}

const DARK = '#1F2937';

function eyes(y = 46, gap = 14) {
  return (
    <G>
      <Circle cx={50 - gap} cy={y} r={4} fill={DARK} />
      <Circle cx={50 + gap} cy={y} r={4} fill={DARK} />
    </G>
  );
}

function renderArt(id: AvatarId) {
  switch (id) {
    case 'dog':
      return (
        <G>
          <Rect width={100} height={100} fill="#FDE68A" />
          <Ellipse cx={24} cy={48} rx={11} ry={22} fill="#7C4A21" />
          <Ellipse cx={76} cy={48} rx={11} ry={22} fill="#7C4A21" />
          <Circle cx={50} cy={52} r={28} fill="#B07A4A" />
          <Ellipse cx={50} cy={64} rx={15} ry={11} fill="#F3DDC3" />
          {eyes(46)}
          <Ellipse cx={50} cy={58} rx={6} ry={4.5} fill={DARK} />
          <Path d="M50 62 L50 68 M44 69 Q50 74 56 69" stroke={DARK} strokeWidth={2} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'cat':
      return (
        <G>
          <Rect width={100} height={100} fill="#DDD6FE" />
          <Polygon points="24,44 26,16 46,32" fill="#F59E0B" />
          <Polygon points="76,44 74,16 54,32" fill="#F59E0B" />
          <Circle cx={50} cy={54} r={28} fill="#FBB040" />
          <Polygon points="30,40 30,26 41,34" fill="#FBCFE8" />
          <Polygon points="70,40 70,26 59,34" fill="#FBCFE8" />
          {eyes(50)}
          <Polygon points="46,58 54,58 50,63" fill="#EC4899" />
          <Path d="M50 63 Q44 70 38 66 M50 63 Q56 70 62 66" stroke={DARK} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Path d="M20 58 L36 60 M20 66 L36 64 M80 58 L64 60 M80 66 L64 64" stroke={DARK} strokeWidth={1.5} strokeLinecap="round" />
        </G>
      );
    case 'owl':
      return (
        <G>
          <Rect width={100} height={100} fill="#BFDBFE" />
          <Polygon points="24,34 30,12 44,28" fill="#8B5A2B" />
          <Polygon points="76,34 70,12 56,28" fill="#8B5A2B" />
          <Ellipse cx={50} cy={56} rx={30} ry={32} fill="#A16B3A" />
          <Circle cx={36} cy={48} r={13} fill="#FFFFFF" />
          <Circle cx={64} cy={48} r={13} fill="#FFFFFF" />
          <Circle cx={36} cy={48} r={6} fill={DARK} />
          <Circle cx={64} cy={48} r={6} fill={DARK} />
          <Polygon points="44,58 56,58 50,70" fill="#F59E0B" />
        </G>
      );
    case 'bear':
      return (
        <G>
          <Rect width={100} height={100} fill="#D1FAE5" />
          <Circle cx={26} cy={28} r={12} fill="#7C4A21" />
          <Circle cx={74} cy={28} r={12} fill="#7C4A21" />
          <Circle cx={50} cy={54} r={30} fill="#A0673A" />
          <Circle cx={26} cy={28} r={6} fill="#D9A877" />
          <Circle cx={74} cy={28} r={6} fill="#D9A877" />
          <Ellipse cx={50} cy={64} rx={14} ry={11} fill="#E8C9A0" />
          {eyes(46)}
          <Ellipse cx={50} cy={59} rx={5.5} ry={4} fill={DARK} />
          <Path d="M50 63 L50 67 M44 68 Q50 72 56 68" stroke={DARK} strokeWidth={2} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'fox':
      return (
        <G>
          <Rect width={100} height={100} fill="#FED7AA" />
          <Polygon points="20,46 24,14 46,32" fill="#EA580C" />
          <Polygon points="80,46 76,14 54,32" fill="#EA580C" />
          <Polygon points="50,86 18,44 82,44" fill="#F97316" />
          <Polygon points="50,86 30,54 70,54" fill="#FFFFFF" />
          <Circle cx={50} cy={48} r={24} fill="#F97316" />
          <Polygon points="50,84 28,52 72,52" fill="#FFFFFF" />
          {eyes(46, 13)}
          <Circle cx={50} cy={72} r={4.5} fill={DARK} />
        </G>
      );
    case 'person':
      return (
        <G>
          <Rect width={100} height={100} fill="#BAE6FD" />
          <Path d="M14 100 Q14 66 50 66 Q86 66 86 100 Z" fill="#1852A4" />
          <Circle cx={50} cy={42} r={20} fill="#F3C9A0" />
          <Path d="M30 40 Q32 20 50 20 Q68 20 70 40 Q60 30 50 30 Q40 30 30 40 Z" fill="#3B2A1A" />
          {eyes(44, 8)}
          <Path d="M42 52 Q50 60 58 52" stroke={DARK} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'robot':
      return (
        <G>
          <Rect width={100} height={100} fill="#E0E7FF" />
          <Rect x={48.5} y={12} width={3} height={14} fill="#64748B" />
          <Circle cx={50} cy={12} r={5} fill="#F59E0B" />
          <Rect x={22} y={26} width={56} height={50} rx={12} fill="#3B82F6" />
          <Rect x={14} y={42} width={8} height={18} rx={4} fill="#1D4ED8" />
          <Rect x={78} y={42} width={8} height={18} rx={4} fill="#1D4ED8" />
          <Circle cx={38} cy={48} r={8} fill="#FFFFFF" />
          <Circle cx={62} cy={48} r={8} fill="#FFFFFF" />
          <Circle cx={38} cy={48} r={4} fill={DARK} />
          <Circle cx={62} cy={48} r={4} fill={DARK} />
          <Path d="M38 63 Q50 72 62 63" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'bus':
      return (
        <G>
          <Rect width={100} height={100} fill="#DBEAFE" />
          <Rect x={18} y={22} width={64} height={52} rx={10} fill="#1852A4" />
          <Rect x={25} y={30} width={50} height={20} rx={4} fill="#DBEAFE" />
          <Rect x={49} y={30} width={2} height={20} fill="#1852A4" />
          <Circle cx={32} cy={62} r={4} fill="#FDE68A" />
          <Circle cx={68} cy={62} r={4} fill="#FDE68A" />
          <Circle cx={32} cy={78} r={7} fill={DARK} />
          <Circle cx={68} cy={78} r={7} fill={DARK} />
        </G>
      );
    case 'whiteCane':
      return (
        <G>
          <Rect width={100} height={100} fill="#E0F2FE" />
          <Path d="M66 20 Q66 12 58 12 Q50 12 50 20" stroke="#FFFFFF" strokeWidth={7} fill="none" strokeLinecap="round" />
          <Path d="M66 20 Q66 12 58 12 Q50 12 50 20" stroke="#94A3B8" strokeWidth={1.5} fill="none" strokeLinecap="round" />
          <Path d="M66 20 L36 88" stroke="#94A3B8" strokeWidth={11} strokeLinecap="round" />
          <Path d="M66 20 L36 88" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" />
          <Path d="M40 79 L36 88" stroke="#374151" strokeWidth={8} strokeLinecap="round" />
        </G>
      );
    case 'greenCane':
      return (
        <G>
          <Rect width={100} height={100} fill="#DCFCE7" />
          <Path d="M66 20 Q66 12 58 12 Q50 12 50 20" stroke="#15803D" strokeWidth={7} fill="none" strokeLinecap="round" />
          <Path d="M66 20 L36 88" stroke="#15803D" strokeWidth={8} strokeLinecap="round" />
          <Path d="M40 79 L36 88" stroke="#374151" strokeWidth={8} strokeLinecap="round" />
        </G>
      );
    case 'redWhiteCane':
      return (
        <G>
          <Rect width={100} height={100} fill="#FEF3C7" />
          <Path d="M66 20 Q66 12 58 12 Q50 12 50 20" stroke="#DC2626" strokeWidth={7} fill="none" strokeLinecap="round" />
          <Path d="M66 20 L36 88" stroke="#94A3B8" strokeWidth={11} strokeLinecap="round" />
          <Path d="M66 20 L36 88" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" />
          <Path d="M61 31 L55 45 M50 57 L44 71" stroke="#DC2626" strokeWidth={8} />
          <Path d="M40 79 L36 88" stroke="#DC2626" strokeWidth={8} strokeLinecap="round" />
        </G>
      );
    case 'star':
    default:
      return (
        <G>
          <Rect width={100} height={100} fill="#FEF9C3" />
          <Polygon
            points="50,14 60,38 86,40 66,57 73,82 50,68 27,82 34,57 14,40 40,38"
            fill="#FACC15"
            stroke="#CA8A04"
            strokeWidth={3}
            strokeLinejoin="round"
          />
        </G>
      );
  }
}
