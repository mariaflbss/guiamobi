import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Camera, LockKeyhole, Mail, Trash2, UserRound } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { AccessibleButton } from '../components/AccessibleButton';
import { Avatar } from '../components/Avatar';
import { InlineMessage } from '../components/InlineMessage';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useAuth } from '../hooks/useAuth';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';
import { profilePhotoService } from '../services/storage/profilePhotoService';

type Props = NativeStackScreenProps<AppStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const { user, updateProfile } = useAuth();
  useStatusBarStyle('light');
  const c = theme.colors;
  const [name, setName] = useState(user?.name ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (user?.id) profilePhotoService.get(user.id).then(uri => { if (active) setPhotoUri(uri); }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);

  async function saveName() {
    setError(null); setMessage(null);
    if (name.trim().length < 2) { setError(t('auth.errors.shortName')); return; }
    if (name.trim() === user?.name) { setMessage(t('profile.nothingChanged')); return; }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      setMessage(t('profile.saved'));
      announce(t('profile.saved'), { haptic: 'success' });
    } catch (e) {
      const text = e instanceof Error ? e.message : t('auth.errors.generic');
      setError(text); announce(text, { haptic: 'error' });
    } finally { setSaving(false); }
  }

  function confirmDeletePhoto() {
    if (!user?.id || !photoUri) return;
    Alert.alert(
      t('profile.deletePhotoTitle'),
      t('profile.deletePhotoConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.deletePhoto'), style: 'destructive', onPress: async () => {
          try {
            await profilePhotoService.remove(user.id);
            setPhotoUri(null);
            setMessage(t('profile.photoDeleted'));
            setError(null);
            announce(t('profile.photoDeleted'), { haptic: 'success' });
          } catch {
            const text = t('profile.photoDeleteError');
            setError(text);
            Alert.alert(t('profile.photoTitle'), text);
          }
        } },
      ],
    );
  }

  async function takePhoto() {
    if (!user?.id) return;
    setError(null); setMessage(null); setTakingPhoto(true);
    try {
      const uri = await profilePhotoService.capture(user.id);
      if (uri) {
        setPhotoUri(uri); setMessage(t('profile.photoSaved'));
        announce(t('profile.photoSaved'), { haptic: 'success' });
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : t('profile.photoError');
      Alert.alert(t('profile.photoTitle'), text);
      setError(text);
    } finally { setTakingPhoto(false); }
  }

  return (
    <ScreenContainer scroll header={<ScreenHeader title={t('profile.title')} subtitle={t('profile.subtitle')} onBack={() => navigation.goBack()} />}>
      <CardSection title={t('profile.photoTitle')}>
        <View style={styles.photoPreview}><Avatar photoUri={photoUri} size={104} /></View>
        <AccessibleText variant="caption" color={c.textSecondary} style={styles.hint}>{t('profile.photoHint')}</AccessibleText>
        <AccessibleButton label={t('profile.takePhoto')} icon={Camera} onPress={takePhoto} loading={takingPhoto} size="lg" />
        <AccessibleButton label={t('profile.deletePhoto')} icon={Trash2} onPress={confirmDeletePhoto} disabled={!photoUri || takingPhoto} size="lg" variant="dangerSoft" />
      </CardSection>

      <CardSection title={t('profile.personalData')}>
        {error ? <InlineMessage message={error} tone="error" /> : null}
        {message ? <InlineMessage message={message} tone="info" /> : null}
        <AccessibleTextInput label={t('profile.name')} icon={UserRound} value={name} onChangeText={setName} textContentType="name" />
        <AccessibleTextInput label={t('profile.email')} icon={Mail} value={user?.email ?? ''} editable={false} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
        <AccessibleButton label={t('profile.saveName')} onPress={saveName} loading={saving} size="lg" />
      </CardSection>

      <CardSection title={t('profile.passwordSection')}>
        <AccessibleText variant="body" color={c.textSecondary}>{t('profile.passwordCodeIntro')}</AccessibleText>
        <AccessibleButton label={t('profile.changePassword')} icon={LockKeyhole} onPress={() => navigation.navigate('ChangePassword')} size="lg" variant="secondary" />
      </CardSection>
    </ScreenContainer>
  );
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useAccessibility();
  return <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header">{title}</AccessibleText>
    <View style={styles.content}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  section: { padding: 16, borderWidth: 1, borderRadius: 18, gap: 14, marginBottom: 16 },
  content: { gap: 14 },
  photoPreview: { alignItems: 'center', marginVertical: 4 },
  hint: { textAlign: 'center' },
});
