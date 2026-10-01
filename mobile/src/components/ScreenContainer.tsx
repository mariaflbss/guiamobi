import React from 'react';
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { HelpFloatingButton } from './HelpFloatingButton';

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  /** Cabeçalho (ex.: <ScreenHeader />) fixo no topo; ele cuida da área segura superior. */
  header?: React.ReactNode;
  /** Padding interno do conteúdo. Padrão: 20. Use 0 para telas com seções de largura total. */
  padding?: number;
  backgroundColor?: string;
  /** Rodapé fixo (ex.: botões de ação) abaixo do conteúdo. */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Container padrão das telas: aplica o fundo do tema, respeita as áreas
 * seguras (topo quando não há cabeçalho, base sempre) e evita conteúdo
 * cortado com textos maiores (US03 - R82).
 */
export function ScreenContainer({
  children,
  scroll = false,
  header,
  padding = 20,
  backgroundColor,
  footer,
  style,
  contentStyle,
}: ScreenContainerProps) {
  const { theme } = useAccessibility();
  const insets = useSafeAreaInsets();
  const bg = backgroundColor ?? theme.colors.background;

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        { padding, paddingBottom: padding + (footer ? 0 : insets.bottom) },
        styles.scrollContent,
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, { padding }, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: bg, paddingTop: header ? 0 : insets.top }, style]}>
      {header}
      {body}
      {footer ? <View style={{ paddingBottom: insets.bottom }}>{footer}</View> : null}
      <HelpFloatingButton hasFooter={Boolean(footer)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
