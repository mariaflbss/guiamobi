import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Card } from './Card';
import { Icon } from './Icon';
import { Tone, toneColors } from './SettingCard';

interface NavRowProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** Elemento no lugar do azulejo de ícone (ex.: avatar). */
  leading?: React.ReactNode;
  onPress: () => void;
  accessibilityHint?: string;
}

/** Linha navegável em cartão (ícone/avatar + título + descrição + seta). */
export function NavRow({ title, description, icon, tone = 'primary', leading, onPress, accessibilityHint }: NavRowProps) {
  const { theme } = useAccessibility();
  const { bg, fg } = toneColors(tone, theme.colors);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityHint={accessibilityHint}
    >
      <Card style={styles.card}>
        {leading ?? (
          <View
            style={[styles.tile, { backgroundColor: bg }]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {icon ? <Icon icon={icon} size={20} color={fg} /> : null}
          </View>
        )}
        <View style={styles.texts}>
          <AccessibleText variant="subtitle" weight="bold">
            {title}
          </AccessibleText>
          {description ? (
            <AccessibleText variant="caption" color={theme.colors.textSecondary} numberOfLines={2}>
              {description}
            </AccessibleText>
          ) : null}
        </View>
        <Icon icon={ChevronRight} size={20} color={theme.colors.textSecondary} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10 },
  tile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
});
