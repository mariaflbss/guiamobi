import React from 'react';
import { StyleSheet, View } from 'react-native';
import { User as UserIcon } from 'lucide-react-native';
import { AvatarArt } from './AvatarArt';
import { Icon } from './Icon';
import { isAvatarId } from '../constants/avatars';
import { useAccessibility } from '../contexts/AccessibilityContext';

/** Avatar redondo do usuário; sem avatar escolhido, mostra um ícone neutro. Decorativo. */
export function Avatar({ avatarId, size = 48 }: { avatarId?: string | null; size?: number }) {
  const { theme } = useAccessibility();

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.primarySoft }]}
    >
      {isAvatarId(avatarId) ? (
        <AvatarArt id={avatarId} size={size} />
      ) : (
        <Icon icon={UserIcon} size={Math.round(size * 0.5)} color={theme.colors.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
