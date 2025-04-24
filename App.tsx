import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View as RNView, Text as RNText, ActivityIndicator as RNActivityIndicator } from 'react-native';
import { styled } from 'nativewind';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';

// Styled components
const View = styled(RNView);
const Text = styled(RNText);
const ActivityIndicator = styled(RNActivityIndicator);

// Screens - import with error handling
let LoginScreen: React.ComponentType<any>, 
    OTPScreen: React.ComponentType<any>,
    HomeScreen: React.ComponentType<any>, 
    ProfileScreen: React.ComponentType<any>, 
    ChatScreen: React.ComponentType<any>, 
    BookingsScreen: React.ComponentType<any>, 
    CallScreen: React.ComponentType<any>, 
    VideoCallScreen: React.ComponentType<any>,
    BookingRequestsScreen: React.ComponentType<any>;

try {
  // Auth screens - correct path with auth subdirectory
  LoginScreen = require('./src/screens/auth/LoginScreen').default;
  OTPScreen = require('./src/screens/auth/OTPScreen').default;
  
  // Main screens
  HomeScreen = require('./src/screens/HomeScreen').default;
  ProfileScreen = require('./src/screens/ProfileScreen').default;
  BookingsScreen = require('./src/screens/BookingsScreen').default;
  BookingRequestsScreen = require('./src/screens/BookingRequestsScreen').default;
  
  // Additional screens
  VideoCallScreen = require('./src/screens/VideoCallScreen').default;
  
  // These may not exist yet, so handle separately
  try { ChatScreen = require('./src/screens/ChatScreen').default; } 
  catch (e) { ChatScreen = () => <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}><Text>Chat Screen (Under Development)</Text></View>; }
  
  try { CallScreen = require('./src/screens/CallScreen').default; } 
  catch (e) { CallScreen = () => <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}><Text>Call Screen (Under Development)</Text></View>; }
} catch (err) {
  console.error('Error loading screens:', err);
  // Create placeholder components if imports fail
  const PlaceholderScreen = ({screenName}: {screenName: string}) => (
    <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
      <Text style={{fontSize: 18, marginBottom: 20}}>Screen Not Found</Text>
      <Text>{screenName}</Text>
    </View>
  );
  
  LoginScreen = () => <PlaceholderScreen screenName="Login Screen" />;
  OTPScreen = () => <PlaceholderScreen screenName="OTP Screen" />;
  HomeScreen = () => <PlaceholderScreen screenName="Home Screen" />;
  ProfileScreen = () => <PlaceholderScreen screenName="Profile Screen" />;
  ChatScreen = () => <PlaceholderScreen screenName="Chat Screen" />;
  BookingsScreen = () => <PlaceholderScreen screenName="Bookings Screen" />;
  CallScreen = () => <PlaceholderScreen screenName="Call Screen" />;
  VideoCallScreen = () => <PlaceholderScreen screenName="Video Call Screen" />;
  BookingRequestsScreen = () => <PlaceholderScreen screenName="Booking Requests Screen" />;
}

// Stack navigation
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Tab Navigator
function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Chat') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Bookings') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Bookings" component={BookingsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Main App Content Component
function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  
  console.log('AppContent rendering - Auth state:', { isAuthenticated, loading });
  
  if (loading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }
  
  const initialRoute = isAuthenticated ? 'Main' : 'Login';
  console.log('Setting initial route to:', initialRoute);
  
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator 
        initialRouteName={initialRoute}
        screenOptions={{ 
          headerShown: false,
          animation: 'slide_from_right'
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="OTP" component={OTPScreen} />
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="VoiceCallSession" component={CallScreen} />
        <Stack.Screen name="VideoCallSession" component={VideoCallScreen} />
        <Stack.Screen name="BookingRequestsTab" component={BookingRequestsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Root App Component (with providers)
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
