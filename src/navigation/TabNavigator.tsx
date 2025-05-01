import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { MainStackParamList, TabNavigatorParamList } from './types';
import OnlineStatusToggle from '../components/OnlineStatusToggle';
import { View } from 'react-native';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import BookingRequestsScreen from '../screens/BookingRequestsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChatsScreen from '../screens/ChatsScreen';

const Tab = createBottomTabNavigator<TabNavigatorParamList>();

export const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;

          if (route.name === 'HomeTab') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'BookingRequestsTab') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'ChatsTab') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'ProfileTab') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#6366F1',
        tabBarInactiveTintColor: 'gray',
        headerShown: true,
      })}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeScreen} 
        options={{ 
          title: 'Home',
          headerTitle: 'Jyotish Call',
          headerTitleAlign: 'center',
          headerRight: () => (
            <View style={{ marginRight: 16 }}>
              <OnlineStatusToggle variant="switch" />
            </View>
          )
        }} 
      />
      <Tab.Screen 
        name="BookingRequestsTab" 
        component={BookingRequestsScreen} 
        options={{ 
          title: 'Requests',
          headerTitle: 'Booking Requests',
          headerTitleAlign: 'center'
        }} 
      />
      <Tab.Screen 
        name="ChatsTab" 
        component={ChatsScreen} 
        options={{ 
          title: 'Chats',
          headerTitle: 'My Chats',
          headerTitleAlign: 'center'
        }} 
      />
      <Tab.Screen 
        name="ProfileTab" 
        component={ProfileScreen} 
        options={{ 
          title: 'Profile',
          headerTitle: 'My Profile',
          headerTitleAlign: 'center'
        }} 
      />
    </Tab.Navigator>
  );
}; 