import React, { useMemo, useRef } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { AccessibleText } from './AccessibleText';
import { Icon } from './Icon';
import { useAccessibility } from '../contexts/AccessibilityContext';

interface Props {
  title: string;
  children: React.ReactNode;
  initialHeight?: number;
  collapsedHeight?: number;
  maxHeightRatio?: number;
}

/** Painel inferior simples e acessível para as duas telas de rota. */
export function RouteBottomSheet({
  title,
  children,
  initialHeight = 220,
  collapsedHeight = 88,
  maxHeightRatio = 0.72,
}: Props) {
  const { theme } = useAccessibility();
  const c = theme.colors;
  const height = useRef(new Animated.Value(initialHeight)).current;
  const currentHeight = useRef(initialHeight);
  const startHeight = useRef(initialHeight);
  const [expanded, setExpanded] = React.useState(initialHeight > collapsedHeight + 20);
  const maxHeight = Math.max(collapsedHeight + 120, Dimensions.get('window').height * maxHeightRatio);

  const clamp = (value: number) => Math.max(collapsedHeight, Math.min(maxHeight || value, value));
  const animateTo = (value: number) => {
    const target = clamp(value);
    currentHeight.current = target;
    setExpanded(target > collapsedHeight + 20);
    Animated.spring(height, { toValue: target, useNativeDriver: false, damping: 22, stiffness: 220, mass: 0.7 }).start();
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => { startHeight.current = currentHeight.current; },
    onPanResponderMove: (_, gesture) => {
      const next = clamp(startHeight.current - gesture.dy);
      currentHeight.current = next;
      height.setValue(next);
      setExpanded(next > collapsedHeight + 20);
    },
    onPanResponderRelease: (_, gesture) => {
      const next = clamp(startHeight.current - gesture.dy);
      const midpoint = collapsedHeight + ((maxHeight || next) - collapsedHeight) / 2;
      animateTo(gesture.vy < -0.35 ? (maxHeight || next) : gesture.vy > 0.35 ? collapsedHeight : next >= midpoint ? (maxHeight || next) : collapsedHeight);
    },
  }), [collapsedHeight, maxHeight]);

  return (
    <Animated.View
      style={[styles.sheet, { height, backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityViewIsModal={false}
    >
      <View {...panResponder.panHandlers} style={[styles.handleArea, { borderBottomColor: c.border }]} accessible accessibilityRole="adjustable" accessibilityLabel={`${title}. Deslize para expandir ou recolher.`}>
        <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />
        <View style={styles.handleRow}>
          <AccessibleText variant="subtitle" weight="extrabold">{title}</AccessibleText>
          <Icon icon={expanded ? ChevronDown : ChevronUp} size={20} color={c.textSecondary} />
        </View>
      </View>
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden', elevation: 8, shadowOpacity: 0.12, shadowRadius: 8 },
  handleArea: { minHeight: 64, paddingHorizontal: 20, paddingTop: 7, borderBottomWidth: 1 },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, marginBottom: 8 },
  handleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { flex: 1 },
});
