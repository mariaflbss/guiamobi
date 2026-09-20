import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { AccessibleButton } from './AccessibleButton';

export interface Choice {
  label: string;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'dangerSoft';
  onPress: () => void;
}

/**
 * Folha de opções (modal): o Alert nativo do Android aceita no máximo três
 * botões, e aqui precisamos de quatro ações (origem, destino, excluir,
 * cancelar). Botões grandes, foco no diálogo e fecha tocando fora.
 */
export function ChoiceSheet({
  visible,
  title,
  choices,
  onClose,
}: {
  visible: boolean;
  title: string;
  choices: Choice[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={styles.backdrop}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header" style={styles.title}>
            {title}
          </AccessibleText>
          <View style={styles.list}>
            {choices.map((choice) => (
              <AccessibleButton
                key={choice.label}
                label={choice.label}
                icon={choice.icon}
                variant={choice.variant ?? 'secondary'}
                onPress={() => {
                  onClose();
                  choice.onPress();
                }}
              />
            ))}
            <AccessibleButton label={t('common.cancel')} variant="link" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,51,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  title: { marginBottom: 14 },
  list: { gap: 10 },
});
