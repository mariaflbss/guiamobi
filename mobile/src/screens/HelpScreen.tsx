import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Accessibility, Bus, ChevronDown, ChevronUp, Lightbulb, Mail, Navigation, Phone, Search, Settings, ShieldCheck } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { InlineMessage } from '../components/InlineMessage';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { SUPPORT_EMAIL, SUPPORT_PHONE } from '../constants/config';
import { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Help'>;

const FAQ: { key: string; icon: LucideIcon }[] = [
  { key: 'findRoute', icon: Search },
  { key: 'startTrip', icon: Navigation },
  { key: 'followTrip', icon: Bus },
  { key: 'accessibility', icon: Settings },
  { key: 'screenReader', icon: Accessibility },
  { key: 'simpleMode', icon: Lightbulb },
  { key: 'privacyPolicy', icon: ShieldCheck },
];

/**
 * Ajuda (mockup 14): perguntas frequentes em sanfona (cada item informa se
 * está expandido) e contato por e-mail/telefone. Os contatos vêm da
 * configuração (EXPO_PUBLIC_SUPPORT_EMAIL / EXPO_PUBLIC_SUPPORT_PHONE); sem
 * eles, os botões não são exibidos.
 */
export function HelpScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { theme, speak } = useAccessibility();
  // Chega já expandida quando aberta a partir de um link específico (ex.: "Política de Privacidade" no cadastro)
  const [openKey, setOpenKey] = useState<string | null>(route.params?.openKey ?? null);
  useStatusBarStyle('light');
  const c = theme.colors;

  const hasContact = Boolean(SUPPORT_EMAIL || SUPPORT_PHONE);

  return (
    <ScreenContainer
      scroll
      header={<ScreenHeader title={t('help.title')} subtitle={t('help.subtitle')} onBack={() => navigation.goBack()} />}
    >
      {FAQ.map(({ key, icon }) => {
        const isOpen = openKey === key;
        return (
          <Card key={key} style={styles.item}>
            <Pressable
              onPress={() => setOpenKey(isOpen ? null : key)}
              accessibilityRole="button"
              accessibilityLabel={t(`help.faq.${key}.q`)}
              accessibilityHint={t(isOpen ? 'help.collapse' : 'help.expand')}
              accessibilityState={{ expanded: isOpen }}
              style={styles.question}
            >
              <View style={[styles.tile, { backgroundColor: c.primarySoft }]} accessible={false} importantForAccessibility="no-hide-descendants">
                <Icon icon={icon} size={20} color={c.primary} />
              </View>
              <AccessibleText variant="body" weight="extrabold" style={styles.flex}>
                {t(`help.faq.${key}.q`)}
              </AccessibleText>
              <Icon icon={isOpen ? ChevronUp : ChevronDown} size={20} color={c.textSecondary} />
            </Pressable>
            {isOpen ? (
              <>
                <AccessibleText variant="body" color={c.textSecondary} style={styles.answer}>
                  {t(`help.faq.${key}.a`)}
                </AccessibleText>
                <AccessibleButton
                  label={t('help.listenAnswer')}
                  accessibilityHint={t('help.listenAnswerHint')}
                  variant="soft"
                  onPress={() => speak(`${t(`help.faq.${key}.q`)}. ${t(`help.faq.${key}.a`)}`)}
                  style={styles.listen}
                />
              </>
            ) : null}
          </Card>
        );
      })}

      <Card backgroundColor={c.primarySoft} borderColor={c.primarySoft} style={styles.contact}>
        <AccessibleText variant="subtitle" weight="extrabold" color={c.primary} accessibilityRole="header">
          {t('help.needMoreHelp')}
        </AccessibleText>
        <AccessibleText variant="body" color={c.textSecondary}>
          {t('help.contactText')}
        </AccessibleText>
        {hasContact ? (
          <View style={styles.buttons}>
            {SUPPORT_EMAIL ? (
              <View style={styles.flex}>
                <AccessibleButton label={t('help.email')} icon={Mail} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
              </View>
            ) : null}
            {SUPPORT_PHONE ? (
              <View style={styles.flex}>
                <AccessibleButton
                  label={t('help.phone')}
                  icon={Phone}
                  variant="secondary"
                  onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`)}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <InlineMessage message={t('help.contactUnavailable')} tone="info" />
        )}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: { marginBottom: 10, overflow: 'hidden' },
  question: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  answer: { paddingHorizontal: 14, paddingBottom: 10, paddingLeft: 66 },
  listen: { marginHorizontal: 14, marginBottom: 14 },
  contact: { padding: 16, gap: 10, marginTop: 10 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 6 },
});
