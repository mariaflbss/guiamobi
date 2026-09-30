import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppTabParamList, AppStackParamList } from './types';
import { AppTabBar } from './AppTabBar';
import { HomeScreen } from '../screens/HomeScreen';
import { RoutesTabScreen } from '../screens/RoutesTabScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PlaceSearchScreen } from '../screens/PlaceSearchScreen';
import { RoutesFoundScreen } from '../screens/RoutesFoundScreen';
import { RouteDetailScreen } from '../screens/RouteDetailScreen';
import { TrackingScreen } from '../screens/TrackingScreen';
import { StopAlertScreen } from '../screens/StopAlertScreen';
import { ArrivalScreen } from '../screens/ArrivalScreen';
import { AddFavoriteScreen } from '../screens/AddFavoriteScreen';
import { HelpScreen } from '../screens/HelpScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { TutorialScreen } from '../screens/TutorialScreen';
import { useAuth } from '../hooks/useAuth';

const Tab = createBottomTabNavigator<AppTabParamList>();
const Stack = createNativeStackNavigator<AppStackParamList>();

/** Abas principais do app autenticado (barra personalizada conforme o mockup). */
function MainTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Routes" component={RoutesTabScreen} />
      <Tab.Screen name="Favorites" component={FavoritesScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

/**
 * Pilha principal do app autenticado. Logo após o cadastro, o tutorial
 * acessível é a primeira tela; ele pode ser pulado ou concluído e, depois
 * disso, continua disponível em Configurações.
 */
export function AppNavigator() {
  const { shouldShowTutorial } = useAuth();

  return (
    <Stack.Navigator
      initialRouteName={shouldShowTutorial ? 'Tutorial' : 'MainTabs'}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="PlaceSearch" component={PlaceSearchScreen} />
      <Stack.Screen name="RoutesFound" component={RoutesFoundScreen} />
      <Stack.Screen name="RouteDetail" component={RouteDetailScreen} />
      <Stack.Screen name="Tracking" component={TrackingScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="StopAlert" component={StopAlertScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="Arrival" component={ArrivalScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="AddFavorite" component={AddFavoriteScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Tutorial" component={TutorialScreen} initialParams={{ firstAccess: shouldShowTutorial }} />
    </Stack.Navigator>
  );
}
