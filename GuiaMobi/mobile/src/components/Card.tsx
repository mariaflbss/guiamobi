import React from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
  backgroundColor?: string;
}

/** Cartão branco arredondado dos mockups (borda clara + sombra suave). */
export function Card({ children, style, borderColor, backgroundColor, ...props }: CardProps) {
  const { theme } = useAccessibility();
  return (
    <View
      {...props}
      style={[
        styles.card,
        {
          backgroundColor: backgroundColor ?? theme.colors.surface,
          borderColor: borderColor ?? theme.colors.border,
          borderWidth: theme.highContrast ? 2 : 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    shadowColor: '#0F1B33',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
});
