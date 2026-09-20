import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, CircleHelp, Contrast, Lightbulb, LogOut, Moon, Sparkles, Vibrate, Volume2 } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { NavRow } from '../components/NavRow';
import { SelectableChipGroup } from '../components/SelectableChipGroup';
import { SettingCard, SettingSwitchRow } from '../components/SettingCard';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useAuth } from '../hooks/useAuth';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { FontSize, SpeechRate, SupportedLanguage } from '../types/settings';
import { AppStackParamList } from '../navigation/types';

type SettingsNavigation = NativeStackNavigationProp<AppStackParamList>;

/**
 * Configurações (US03/US08, mockup 12). Tudo é salvo na hora. O Modo
 * Simples muda a interface de verdade (ver HomeScreen/SimpleHomeScreen).
 * "Voz ativada" e "Vibração ativada" combinam nos quatro modos de
 * feedback: só voz, só vibração, voz + vibração ou nenhum.
 * "Testar feedback" executa exatamente o modo escolhido.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const {
    settings,
    theme,
    language,
    updateSettings,
    setLanguage,
    voiceEnabled,
    hapticsEnabled,
    setVoiceEnabled,
    setHapticsEnabled,
    testFeedback,
    speak,
    announce,
  } = useAccessibility();
  const { user, logout } = useAuth();
  const navigation = useNavigation<SettingsNavigation>();
  useStatusBarStyle('light');
  const c = theme.colors;

  const feedbackNone = !voiceEnabled && !hapticsEnabled;
  const feedbackLabel = voiceEnabled && hapticsEnabled
    ? t('settings.feedbackBoth')
    : voiceEnabled
    ? t('settings.feedbackVoice')
    : hapticsEnabled
    ? t('settings.feedbackHaptics')
    : t('settings.feedbackNone');

  async function toggleSimpleMode() {
    const next = !settings.simpleMode;
    await updateSettings({ simpleMode: next });
    announce(t(next ? 'settings.simpleModeOnAnnounce' : 'settings.simpleModeOffAnnounce'), { haptic: 'success' });
    if (next) navigation.navigate('MainTabs', { screen: 'Home' });
  }

  function confirmLogout() {
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logout'), style: 'destructive', onPress: () => logout() },
    ]);
  }

  return (
    <ScreenContainer scroll header={<ScreenHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />}>
      {/* Modo Simples (banner escuro do mockup) */}
      <Pressable
        onPress={toggleSimpleMode}
        accessibilityRole="switch"
        accessibilityLabel={t('settings.simpleModeCard')}
        accessibilityHint={t('settings.simpleModeCardDescription')}
        accessibilityState={{ checked: settings.simpleMode }}
        style={[styles.banner, { backgroundColor: c.primary, borderColor: theme.highContrast ? c.text : 'transparent' }]}
      >
        <View style={styles.bannerTile} accessible={false} importantForAccessibility="no-hide-descendants">
          <Icon icon={Lightbulb} size={24} color="#FFFFFF" />
        </View>
        <View style={styles.flex}>
          <AccessibleText variant="subtitle" weight="extrabold" color="#FFFFFF">
            {t('settings.simpleModeCard')}
          </AccessibleText>
          <AccessibleText variant="caption" weight="semibold" color="#DDE6F5">
            {t('settings.simpleModeCardDescription')}
          </AccessibleText>
        </View>
        <Icon icon={settings.simpleMode ? Check : ArrowRight} size={22} color="#FFFFFF" />
      </Pressable>

      <SectionTitle title={t('settings.textSection')} />
      <SettingCard glyph="A" title={t('settings.fontSize')}>
        <SelectableChipGroup<FontSize>
          accessibilityLabel={t('settings.fontSize')}
          selected={settings.fontSize}
          onSelect={(fontSize) => updateSettings({ fontSize })}
          options={[
            { value: 'pequeno', label: t('settings.fontSizeSmall') },
            { value: 'medio', label: t('settings.fontSizeMedium') },
            { value: 'grande', label: t('settings.fontSizeLarge') },
          ]}
        />
      </SettingCard>

      <SectionTitle title={t('settings.visionSection')} />
      <SettingSwitchRow
        icon={Contrast}
        title={t('settings.highContrast')}
        description={t('settings.highContrastDescription')}
        value={settings.highContrast}
        onValueChange={(highContrast) => updateSettings({ highContrast })}
      />
      <SettingSwitchRow
        icon={Moon}
        tone="purple"
        title={t('settings.darkMode')}
        description={t('settings.darkModeDescription')}
        value={settings.darkMode}
        onValueChange={(darkMode) => updateSettings({ darkMode })}
      />

      <SectionTitle title={t('settings.audioSection')} />
      <SettingCard icon={Volume2} tone="success" title={t('settings.speechRate')}>
        <SelectableChipGroup<SpeechRate>
          accessibilityLabel={t('settings.speechRate')}
          tone="success"
          selected={settings.speechRate}
          onSelect={(speechRate) => updateSettings({ speechRate })}
          options={[
            { value: 'lenta', label: t('settings.speechRateSlow') },
            { value: 'normal', label: t('settings.speechRateNormal') },
            { value: 'rapida', label: t('settings.speechRateFast') },
          ]}
        />
        <AccessibleButton
          label={t('settings.testVoice')}
          icon={Volume2}
          variant="secondary"
          disabled={!voiceEnabled}
          accessibilityHint={voiceEnabled ? t('settings.testVoiceHint') : t('settings.testFeedbackDisabledHint')}
          onPress={() => speak(t('settings.testVoiceMessage'))}
          style={styles.testVoice}
        />
      </SettingCard>
      <SettingSwitchRow
        icon={Volume2}
        tone="success"
        title={t('settings.voiceActive')}
        description={t('settings.voiceActiveDescription')}
        value={voiceEnabled}
        onValueChange={setVoiceEnabled}
      />
      <SettingSwitchRow
        icon={Vibrate}
        tone="warning"
        title={t('settings.hapticsActive')}
        description={t('settings.hapticsActiveDescription')}
        value={hapticsEnabled}
        onValueChange={setHapticsEnabled}
      />
      <AccessibleText
        variant="caption"
        weight="bold"
        color={c.textSecondary}
        style={styles.feedbackCurrent}
        accessibilityLiveRegion="polite"
      >
        {t('settings.feedbackCurrent', { mode: feedbackLabel })}
      </AccessibleText>
      <AccessibleButton
        label={t('settings.testFeedback')}
        icon={Sparkles}
        disabled={feedbackNone}
        accessibilityHint={feedbackNone ? t('settings.testFeedbackDisabledHint') : t('settings.testFeedbackHint')}
        onPress={() => testFeedback(t('settings.testFeedbackMessage'))}
      />

      <SectionTitle title={t('settings.languageSection')} />
      <SettingCard glyph="Aa" title={t('settings.language')}>
        <SelectableChipGroup<SupportedLanguage>
          accessibilityLabel={t('settings.language')}
          selected={language}
          onSelect={setLanguage}
          options={[
            { value: 'pt', label: 'Português' },
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
          ]}
        />
      </SettingCard>

      <SectionTitle title={t('settings.accountSection')} />
      <NavRow
        title={t('settings.editProfile')}
        description={user ? `${user.name} · ${user.email}` : undefined}
        leading={<Avatar avatarId={user?.avatarId} size={44} />}
        onPress={() => navigation.navigate('EditProfile')}
      />
      <NavRow
        icon={Sparkles}
        tone="purple"
        title={t('settings.tutorialButton')}
        description={t('settings.tutorialDescription')}
        onPress={() => navigation.navigate('Tutorial')}
      />
      <NavRow
        icon={CircleHelp}
        tone="success"
        title={t('settings.help')}
        description={t('settings.helpDescription')}
        onPress={() => navigation.navigate('Help')}
      />

      <AccessibleButton label={t('settings.logout')} icon={LogOut} variant="dangerSoft" onPress={confirmLogout} style={styles.logout} />
    </ScreenContainer>
  );
}

function SectionTitle({ title }: { title: string }) {
  const { theme } = useAccessibility();
  return (
    <AccessibleText variant="label" color={theme.colors.textSecondary} accessibilityRole="header" style={styles.sectionTitle}>
      {title.toUpperCase()}
    </AccessibleText>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 2,
    padding: 18,
    minHeight: 84,
  },
  bannerTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { letterSpacing: 0.8, marginTop: 22, marginBottom: 10 },
  testVoice: { marginTop: 12 },
  feedbackCurrent: { marginTop: 4, marginBottom: 12 },
  logout: { marginTop: 22, marginBottom: 12 },
});
