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
  maxHeight?: number;
  onExpandedChange?: (expanded: boolean) => void;
}

/** Painel inferior acessível e arrastável para as telas de rota. */
export function RouteBottomSheet({
  title,
  children,
  initialHeight = 220,
  collapsedHeight = 74,
  maxHeightRatio = 0.72,
  maxHeight: maxHeightProp,
  onExpandedChange,
}: Props) {
  const { theme } = useAccessibility();
  const c = theme.colors;
  const height = useRef(new Animated.Value(initialHeight)).current;
  const currentHeight = useRef(initialHeight);
  const startHeight = useRef(initialHeight);
  const maxHeight = Math.max(
    collapsedHeight + 120,
    maxHeightProp ?? Dimensions.get('window').height * maxHeightRatio,
  );
  const [expanded, setExpanded] = React.useState(initialHeight > collapsedHeight + 20);

  const clamp = (value: number) =>
    Math.max(collapsedHeight, Math.min(maxHeight, value));

  const animateTo = (value: number) => {
    const target = clamp(value);
    currentHeight.current = target;
    const nextExpanded = target > collapsedHeight + 20;
    setExpanded(nextExpanded);
    onExpandedChange?.(nextExpanded);
    Animated.spring(height, {
      toValue: target,
      useNativeDriver: false,
      damping: 22,
      stiffness: 220,
      mass: 0.7,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 3,
        onPanResponderGrant: () => {
          startHeight.current = currentHeight.current;
        },
        onPanResponderMove: (_, gesture) => {
          const next = clamp(startHeight.current - gesture.dy);
          currentHeight.current = next;
          height.setValue(next);
          setExpanded(next > collapsedHeight + 20);
        },
        onPanResponderRelease: (_, gesture) => {
          const moved = Math.abs(gesture.dy) > 8;
          if (!moved) {
            animateTo(expanded ? collapsedHeight : maxHeight);
            return;
          }

          const next = clamp(startHeight.current - gesture.dy);
          const midpoint = collapsedHeight + (maxHeight - collapsedHeight) / 2;
          const target =
            gesture.vy < -0.35
              ? maxHeight
              : gesture.vy > 0.35
                ? collapsedHeight
                : next >= midpoint
                  ? maxHeight
                  : collapsedHeight;
          animateTo(target);
        },
      }),
    [collapsedHeight, maxHeight, expanded, onExpandedChange],
  );

  const contentHeight = Animated.subtract(height, collapsedHeight);

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height,
          backgroundColor: c.surface,
          borderColor: c.border,
        },
      ]}
      accessibilityViewIsModal={false}
    >
      <View
        {...panResponder.panHandlers}
        style={[styles.handleArea, { borderBottomColor: c.border }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${title}. Deslize para expandir ou recolher.`}
      >
        <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />
        <View style={styles.handleRow}>
          <AccessibleText variant="subtitle" weight="extrabold">{title}</AccessibleText>
          <Icon icon={expanded ? ChevronDown : ChevronUp} size={20} color={c.textSecondary} />
        </View>
      </View>

      {expanded ? (
        <Animated.View style={[styles.content, { height: contentHeight }]}>
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
    elevation: 8,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    zIndex: 30,
  },
  handleArea: {
    height: 74,
    paddingHorizontal: 20,
    paddingTop: 7,
    borderBottomWidth: 1,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    marginBottom: 9,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    minHeight: 0,
    overflow: 'hidden',
  },
});
