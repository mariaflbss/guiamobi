import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Coordinates } from '../types/location';

interface RouteMapProps {
  stops: Coordinates[];
  lineCode: string;
  boardingIndex?: number;
  destinationIndex?: number;
  /** Posição do usuário (GPS do aparelho), quando houver. */
  user?: Coordinates | null;
  height?: number;
  accessibilityLabel: string;
  /** Texto do selo no canto inferior esquerdo (ex.: "GPS do aparelho"). */
  badge?: string;
}

/**
 * Mapa ESQUEMÁTICO da linha (mockups 06 e 07): fundo verde-claro com
 * quadrícula, traçado da linha, paradas, destino e a posição do usuário. É
 * desenhado a partir das coordenadas reais das paradas - não é um mapa de
 * ruas e não mostra o ônibus em tempo real. É uma imagem: para leitores de
 * tela a informação equivalente está nas listas de paradas da própria tela.
 */
export function RouteMap({
  stops,
  lineCode,
  boardingIndex,
  destinationIndex,
  user,
  height = 150,
  accessibilityLabel,
  badge,
}: RouteMapProps) {
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const c = theme.colors;
  const [width, setWidth] = useState(0);

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  const points = user ? [...stops, user] : stops;
  const pad = 26;
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const spanLat = Math.max(maxLat - minLat, 1e-5);
  const spanLon = Math.max(maxLon - minLon, 1e-5);
  // Escala única nos dois eixos para não distorcer o traçado
  const scale = Math.min((width - pad * 2) / spanLon, (height - pad * 2) / spanLat);
  const offsetX = (width - spanLon * scale) / 2;
  const offsetY = (height - spanLat * scale) / 2;

  const project = (p: Coordinates) => ({
    x: offsetX + (p.longitude - minLon) * scale,
    y: height - (offsetY + (p.latitude - minLat) * scale),
  });

  const projected = stops.map(project);
  const line = projected.map((p) => `${p.x},${p.y}`).join(' ');
  const gridStep = 30;

  return (
    <View
      onLayout={onLayout}
      style={[styles.container, { height, backgroundColor: c.mapBackground }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {width > 0 && stops.length > 1 ? (
        <Svg width={width} height={height}>
          <G>
            {Array.from({ length: Math.ceil(width / gridStep) }, (_, i) => (
              <Line key={`v${i}`} x1={i * gridStep} y1={0} x2={i * gridStep} y2={height} stroke={c.mapGrid} strokeWidth={1} />
            ))}
            {Array.from({ length: Math.ceil(height / gridStep) }, (_, i) => (
              <Line key={`h${i}`} x1={0} y1={i * gridStep} x2={width} y2={i * gridStep} stroke={c.mapGrid} strokeWidth={1} />
            ))}
          </G>
          <Polyline points={line} fill="none" stroke={c.primary} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          <Polyline points={line} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" />
          {projected.map((p, i) => {
            if (i === destinationIndex || i === boardingIndex) return null;
            return <Circle key={i} cx={p.x} cy={p.y} r={5} fill="#FFFFFF" stroke={c.primary} strokeWidth={2.5} />;
          })}
          {boardingIndex !== undefined && projected[boardingIndex] ? (
            <Circle cx={projected[boardingIndex].x} cy={projected[boardingIndex].y} r={7} fill={c.primary} stroke="#FFFFFF" strokeWidth={3} />
          ) : null}
          {destinationIndex !== undefined && projected[destinationIndex] ? (
            <Circle cx={projected[destinationIndex].x} cy={projected[destinationIndex].y} r={8} fill={c.successStrong} stroke="#FFFFFF" strokeWidth={3} />
          ) : null}
          {user ? (
            <Rect
              x={project(user).x - 9}
              y={project(user).y - 9}
              width={18}
              height={18}
              rx={5}
              fill={c.primaryDark}
              stroke="#FFFFFF"
              strokeWidth={3}
            />
          ) : null}
        </Svg>
      ) : null}

      <View style={[styles.legend, { backgroundColor: c.surface }]} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={styles.legendRow}>
          <View style={[styles.legendLine, { backgroundColor: c.primary }]} />
          <AccessibleText variant="caption" weight="bold" style={styles.legendText}>
            {t('routeDetail.legendLine', { code: lineCode })}
          </AccessibleText>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: c.primaryDark }]} />
          <AccessibleText variant="caption" weight="bold" style={styles.legendText}>
            {t('routeDetail.legendYou')}
          </AccessibleText>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: c.successStrong }]} />
          <AccessibleText variant="caption" weight="bold" style={styles.legendText}>
            {t('routeDetail.legendDestination')}
          </AccessibleText>
        </View>
      </View>

      {badge ? (
        <View style={[styles.badge, { backgroundColor: c.primaryDark }]} accessible={false} importantForAccessibility="no-hide-descendants">
          <AccessibleText variant="caption" weight="bold" color="#FFFFFF">
            {badge}
          </AccessibleText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden' },
  legend: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 14, height: 4, borderRadius: 2 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11 },
  badge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
