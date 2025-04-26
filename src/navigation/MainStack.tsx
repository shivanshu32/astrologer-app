import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainStackParamList } from './types';
import { TabNavigator } from './TabNavigator';

// Import screens
import ConsultationsScreen from '../screens/ConsultationsScreen';
import EarningsScreen from '../screens/EarningsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator<MainStackParamList>();

export const MainStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="TabHome" component={TabNavigator} />
      <Stack.Screen name="Consultations" component={ConsultationsScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}; 