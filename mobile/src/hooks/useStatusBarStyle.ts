import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';

/**
 * Ajusta a cor dos ícones da barra de status enquanto a tela está em foco.
 * Telas com cabeçalho azul usam "light"; telas claras usam "dark".
 */
export function useStatusBarStyle(style: 'light' | 'dark') {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style);
    }, [style])
  );
}
