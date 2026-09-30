import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { MIN_TOUCH_TARGET } from '../theme/theme';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SelectableChipGroupProps<T extends string> {
  options: Option<T>[];
  selected: T;
  onSelect: (value: T) => void;
  accessibilityLabel: string;
  /** Cor da opção selecionada: azul (padrão) ou verde (velocidade da voz nos mockups). */
  tone?: 'primary' | 'success';
}

/**
 * Grupo de opções exclusivas (ex.: tamanho do texto, velocidade da voz).
 * Role "radiogroup"/"radio" + estado "selected", e a seleção não depende só
 * de cor: a opção escolhida fica preenchida E em negrito (US03/US08).
 */
export function SelectableChipGroup<T extends string>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  tone = 'primary',
}: SelectableChipGroupProps<T>) {
  const { theme } = useAccessibility();
  const c = theme.colors;
  const activeBg = tone === 'success' ? c.successButton : c.primaryDark;

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isSelected, checked: isSelected }}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? activeBg : c.surfaceAlt,
                borderColor: isSelected ? activeBg : c.border,
              },
            ]}
          >
            <AccessibleText
              variant="body"
              weight={isSelected ? 'extrabold' : 'semibold'}
              color={isSelected ? '#FFFFFF' : c.text}
              style={styles.chipText}
            >
              {option.label}
            </AccessibleText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 84,
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    textAlign: 'center',
  },
});
