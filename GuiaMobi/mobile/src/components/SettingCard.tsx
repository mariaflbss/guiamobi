import React from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Card } from './Card';
import { Icon } from './Icon';

export type Tone = 'primary' | 'purple' | 'success' | 'warning' | 'danger';

/** Cores do "azulejo" de ícone de cada tipo de item (mockups de Configurações e Favoritos). */
export function toneColors(tone: Tone, colors: ReturnType<typeof useAccessibility>['theme']['colors']) {
  switch (tone) {
    case 'purple':
      return { bg: colors.purpleSoft, fg: colors.purple };
    case 'success':
      return { bg: colors.successSoft, fg: colors.success };
    case 'warning':
      return { bg: colors.warningSoft, fg: colors.warning };
    case 'danger':
      return { bg: colors.errorSoft, fg: colors.error };
    default:
      return { bg: colors.primarySoft, fg: colors.primary };
  }
}

interface SettingCardProps {
  icon?: LucideIcon;
  /** Alternativa ao ícone: um caractere/elemento decorativo (ex.: a letra "A" do tamanho do texto). */
  glyph?: string;
  tone?: Tone;
  title: string;
  description?: string;
  /** Elemento à direita (ex.: Switch). */
  right?: React.ReactNode;
  /** Conteúdo abaixo do título (ex.: chips). */
  children?: React.ReactNode;
}

/** Cartão de configuração: azulejo de ícone + título/descrição + controle. */
export function SettingCard({ icon, glyph, tone = 'primary', title, description, right, children }: SettingCardProps) {
  const { theme } = useAccessibility();
  const { bg, fg } = toneColors(tone, theme.colors);

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View
          style={[styles.tile, { backgroundColor: bg }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {icon ? (
            <Icon icon={icon} size={20} color={fg} />
          ) : (
            <AccessibleText variant="heading" weight="extrabold" color={fg}>
              {glyph}
            </AccessibleText>
          )}
        </View>
        <View style={styles.texts}>
          <AccessibleText variant="subtitle" weight="bold" accessibilityRole={children ? 'header' : undefined}>
            {title}
          </AccessibleText>
          {description ? (
            <AccessibleText variant="caption" color={theme.colors.textSecondary}>
              {description}
            </AccessibleText>
          ) : null}
        </View>
        {right}
      </View>
      {children ? <View style={styles.children}>{children}</View> : null}
    </Card>
  );
}

interface SettingSwitchRowProps {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

/** Linha de configuração com switch (Alto contraste, Modo escuro, Voz ativada...). */
export function SettingSwitchRow({ icon, tone, title, description, value, onValueChange }: SettingSwitchRowProps) {
  const { theme } = useAccessibility();

  return (
    <SettingCard
      icon={icon}
      tone={tone}
      title={title}
      description={description}
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          accessibilityLabel={title}
          accessibilityHint={description}
          trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
          thumbColor="#FFFFFF"
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
  children: {
    marginTop: 12,
  },
});
