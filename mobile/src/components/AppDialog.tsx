import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { AccessibleButton } from './AccessibleButton';

interface DialogAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'dangerSoft' | 'soft' | 'success' | 'warning' | 'link';
  icon?: LucideIcon;
}

interface AppDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  onClose: () => void;
  actions?: DialogAction[];
}

export function AppDialog({ visible, title, message, onClose, actions = [] }: AppDialogProps) {
  const { theme } = useAccessibility();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, marginBottom: insets.bottom + 16 }]}>
          <AccessibleText variant="subtitle" weight="extrabold" color={c.text} accessibilityRole="header" style={styles.title}>
            {title}
          </AccessibleText>
          {message ? (
            <AccessibleText variant="body" color={c.textSecondary} style={styles.message}>
              {message}
            </AccessibleText>
          ) : null}
          <View style={styles.actions}>
            {actions.map((action) => (
              <AccessibleButton
                key={action.label}
                label={action.label}
                icon={action.icon}
                variant={action.variant ?? 'primary'}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
              />
            ))}
            {actions.length === 0 ? (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                style={styles.close}
              >
                <AccessibleText variant="button" weight="bold" color={c.primary}>
                  {t('common.close')}
                </AccessibleText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,51,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, borderRadius: 22, borderWidth: 1, padding: 20 },
  title: { marginBottom: 10 },
  message: { lineHeight: 24, marginBottom: 18 },
  actions: { gap: 10 },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
});
