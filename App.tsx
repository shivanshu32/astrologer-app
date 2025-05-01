import 'react-native-get-random-values';
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
import { BookingNotificationProvider } from './src/contexts/BookingNotificationContext';
import { ChatsProvider } from './src/contexts/ChatsContext';
import BookingRequestPopup from './src/components/BookingRequestPopup';

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
    ChatsScreen: React.ComponentType<any>, 
    BookingsScreen: React.ComponentType<any>, 
    CallScreen: React.ComponentType<any>, 
    VideoCallScreen: React.ComponentType<any>,
    BookingRequestsScreen: React.ComponentType<any>,
    ConsultationsScreen: React.ComponentType<any>,
    DebugScreen: React.ComponentType<any>;

try {
  // Auth screens - correct path with auth subdirectory
  LoginScreen = require('./src/screens/auth/LoginScreen').default;
  OTPScreen = require('./src/screens/auth/OTPScreen').default;
  
  // Main screens
  HomeScreen = require('./src/screens/HomeScreen').default;
  ProfileScreen = require('./src/screens/ProfileScreen').default;
  BookingsScreen = require('./src/screens/BookingsScreen').default;
  BookingRequestsScreen = require('./src/screens/BookingRequestsScreen').default;
  ConsultationsScreen = require('./src/screens/ConsultationsScreen').default;
  DebugScreen = require('./src/screens/DebugScreen').default;
  
  // Chat screens
  ChatScreen = require('./src/screens/ChatScreen').default;
  ChatsScreen = require('./src/screens/ChatsScreen').default;
  
  // Additional screens
  VideoCallScreen = require('./src/screens/VideoCallScreen').default;
  CallScreen = require('./src/screens/CallScreen').default;
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
  ChatsScreen = () => <PlaceholderScreen screenName="Chats Screen" />;
  BookingsScreen = () => <PlaceholderScreen screenName="Bookings Screen" />;
  CallScreen = () => <PlaceholderScreen screenName="Call Screen" />;
  VideoCallScreen = () => <PlaceholderScreen screenName="Video Call Screen" />;
  BookingRequestsScreen = () => <PlaceholderScreen screenName="Booking Requests Screen" />;
  ConsultationsScreen = () => <PlaceholderScreen screenName="Consultations Screen" />;
  DebugScreen = () => <PlaceholderScreen screenName="Debug Screen" />;
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
          } else if (route.name === 'Chats') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Bookings') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Debug') {
            iconName = focused ? 'bug' : 'bug-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: 'gray',
        headerShown: true,
        headerTitleStyle: {
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen 
        name="Chats" 
        component={ChatsScreen}
        options={{ title: 'Messages' }}
      />
      <Tab.Screen 
        name="Bookings" 
        component={BookingsScreen}
        options={{ title: 'Bookings' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
      <Tab.Screen 
        name="Debug" 
        component={DebugScreen}
        options={{ title: 'Debug' }}
      />
    </Tab.Navigator>
  );
}

// Add this temporary function to debug token
const debugToken = async () => {
  try {
    const token = await AsyncStorage.getItem('token');
    console.log('========== JWT TOKEN ==========');
    console.log(token);
    console.log('===============================');
  } catch (error) {
    console.error('Error getting token:', error);
  }
};

// Main App Content Component
function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  
  // Call the debug function when app loads if user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      debugToken();
    }
  }, [isAuthenticated]);
  
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
          headerShown: true,
          animation: 'slide_from_right',
          headerTitleStyle: {
            fontWeight: '600',
          },
          headerBackTitleVisible: false,
        }}
      >
        <Stack.Screen 
          name="Login" 
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="OTP" 
          component={OTPScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Main" 
          component={TabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Chat" 
          component={ChatScreen}
          options={{ 
            headerShown: true,
            headerTitle: '',
            headerShadowVisible: false,
            headerStyle: {
              backgroundColor: '#F5F5F5'
            }
          }}
        />
        <Stack.Screen 
          name="VoiceCallSession" 
          component={CallScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="VideoCallSession" 
          component={VideoCallScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="BookingRequestsTab" 
          component={BookingRequestsScreen}
        />
        <Stack.Screen 
          name="Consultations" 
          component={ConsultationsScreen}
        />
      </Stack.Navigator>
      
      {/* Render the booking request popup when authenticated */}
      {isAuthenticated && <BookingRequestPopup />}
    </NavigationContainer>
  );
}

// Root App Component (with providers)
export default function App() {
  return (
    <BookingNotificationProvider>
      <AuthProvider>
        <ChatsProvider>
          <AppContent />
        </ChatsProvider>
      </AuthProvider>
    </BookingNotificationProvider>
  );
}
