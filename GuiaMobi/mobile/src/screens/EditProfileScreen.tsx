import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Check, Mail, User } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { PasswordInput } from '../components/PasswordInput';
import { AccessibleButton } from '../components/AccessibleButton';
import { AvatarArt } from '../components/AvatarArt';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { InlineMessage } from '../components/InlineMessage';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useAuth } from '../hooks/useAuth';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AVATAR_IDS, AvatarId, isAvatarId } from '../constants/avatars';
import { AppStackParamList } from '../navigation/types';
import { MIN_TOUCH_TARGET } from '../theme/theme';

type Props = NativeStackScreenProps<AppStackParamList, 'EditProfile'>;

const AVATAR_SIZE = 64;

/**
 * Editar perfil: nome, e-mail, senha (com confirmação) e avatar. Só os dados
 * necessários. Os avatares são apenas opções visuais (qualquer pessoa pode
 * escolher qualquer um) e cada um tem uma descrição para leitores de tela,
 * que também é falada ao selecionar quando o feedback por voz está ativo.
 */
export function EditProfileScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const { user, updateProfile } = useAuth();
  useStatusBarStyle('light');
  const c = theme.colors;

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(user?.avatarId ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  function fail(message: string) {
    setSavedMessage(null);
    setErrorMessage(message);
    announce(message, { haptic: 'error' });
  }

  function pickAvatar(id: AvatarId) {
    setAvatarId(id);
    announce(`${t(`avatars.${id}`)} ${t('profile.avatarSelected')}`, { haptic: 'light' });
  }

  async function save() {
    setErrorMessage(null);
    setSavedMessage(null);

    if (name.trim().length < 2) return fail(t('auth.errors.shortName'));
    if (!email.includes('@')) return fail(t('auth.errors.invalidEmail'));
    if (password.length > 0 && password.length < 8) return fail(t('auth.errors.shortPassword'));
    if (password !== confirmPassword) return fail(t('auth.errors.passwordsDontMatch'));

    const changes: { name?: string; email?: string; password?: string; avatarId?: string | null } = {};
    if (name.trim() !== user?.name) changes.name = name.trim();
    if (email.trim().toLowerCase() !== user?.email) changes.email = email.trim();
    if (password.length > 0) changes.password = password;
    if (avatarId !== (user?.avatarId ?? null)) changes.avatarId = avatarId;

    if (Object.keys(changes).length === 0) {
      setSavedMessage(t('profile.nothingChanged'));
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile(changes);
      setPassword('');
      setConfirmPassword('');
      setSavedMessage(t('profile.saved'));
      announce(t('profile.saved'), { haptic: 'success' });
    } catch (error) {
      fail(error instanceof Error ? error.message : t('auth.errors.generic'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScreenContainer
      scroll
      header={<ScreenHeader title={t('profile.title')} subtitle={t('profile.subtitle')} onBack={() => navigation.goBack()} />}
    >
      <View style={styles.preview}>
        <Avatar avatarId={avatarId} size={88} />
      </View>

      {errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}
      {savedMessage ? <InlineMessage message={savedMessage} tone="info" /> : null}

      <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header">
        {t('profile.avatarSection')}
      </AccessibleText>
      <AccessibleText variant="caption" color={c.textSecondary} style={styles.avatarHint}>
        {t('profile.avatarHint')}
      </AccessibleText>

      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t('profile.avatarSection')}>
        {AVATAR_IDS.map((id) => {
          const selected = isAvatarId(avatarId) && avatarId === id;
          return (
            <Pressable
              key={id}
              onPress={() => pickAvatar(id)}
              accessibilityRole="radio"
              accessibilityLabel={t(`avatars.${id}`)}
              accessibilityState={{ selected, checked: selected }}
              style={[styles.avatarButton, { borderColor: selected ? c.primary : c.border, borderWidth: selected ? 3 : 1 }]}
            >
              <View style={styles.avatarClip} accessible={false} importantForAccessibility="no-hide-descendants">
                <AvatarArt id={id} size={AVATAR_SIZE} />
              </View>
              {selected ? (
                <View style={[styles.check, { backgroundColor: c.primary }]} accessible={false} importantForAccessibility="no-hide-descendants">
                  <Icon icon={Check} size={14} color={c.onPrimary} strokeWidth={3} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.form}>
        <AccessibleTextInput label={t('profile.name')} icon={User} value={name} onChangeText={setName} textContentType="name" />
        <AccessibleTextInput
          label={t('profile.email')}
          icon={Mail}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <PasswordInput
          label={t('profile.newPassword')}
          placeholder={t('profile.newPasswordPlaceholder')}
          value={password}
          onChangeText={setPassword}
          textContentType="newPassword"
        />
        <PasswordInput
          label={t('profile.confirmNewPassword')}
          placeholder={t('auth.confirmPasswordPlaceholder')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        <AccessibleButton label={t('profile.save')} onPress={save} loading={isSaving} size="lg" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', marginBottom: 16 },
  avatarHint: { marginTop: 2, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarButton: {
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    minWidth: MIN_TOUCH_TARGET,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarClip: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, overflow: 'hidden' },
  check: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { marginTop: 24 },
});
