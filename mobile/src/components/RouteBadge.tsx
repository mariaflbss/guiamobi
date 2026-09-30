import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AccessibleText } from './AccessibleText';
import { LINE_BADGE_COLORS } from '../constants/colors';

/** Cor estável para cada código de linha (mesmo código → mesma cor). */
export function colorForLine(code: string): string {
  let sum = 0;
  for (let i = 0; i < code.length; i += 1) sum += code.charCodeAt(i);
  return LINE_BADGE_COLORS[sum % LINE_BADGE_COLORS.length];
}

/** Quadrado colorido com o número da linha (mockups: 301, 315, 320). */
export function RouteBadge({ code, size = 46 }: { code: string; size?: number }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.badge, { width: size, height: size, backgroundColor: colorForLine(code) }]}
    >
      <AccessibleText variant="subtitle" weight="extrabold" color="#FFFFFF" numberOfLines={1} adjustsFontSizeToFit>
        {code}
      </AccessibleText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
});
