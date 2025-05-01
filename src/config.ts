import { Platform } from 'react-native';

// Define API URLs for different environments - Update your server IP here
export const LOCAL_IP = '192.168.29.231'; // Your computer's IP on your local network
export const API_PORT = '3002';

// Default to localhost for web development
export const DEV_API_URL = `http://localhost:${API_PORT}/api`;

// For development on actual devices (need local network IP)
export const LOCAL_NETWORK_API_URL = `http://${LOCAL_IP}:${API_PORT}/api`;

// For Android emulator, 10.0.2.2 points to host's localhost
export const ANDROID_EMULATOR_URL = `http://10.0.2.2:${API_PORT}/api`;

// Production API URL
export const PROD_API_URL = 'https://api.jyotish.app/api';

// Choose the right API URL based on environment
export const API_URL = (() => {
  let baseUrl;

  // For production environment, use production URL or env variable
  if (process.env.NODE_ENV === 'production' || process.env.EXPO_PUBLIC_API_URL) {
    baseUrl = process.env.EXPO_PUBLIC_API_URL || PROD_API_URL;
  }
  // IMPORTANT: On Android, use the special 10.0.2.2 IP for emulator
  else if (Platform.OS === 'android') {
    console.log('🤖 Android detected - using 10.0.2.2 for emulator access');
    baseUrl = ANDROID_EMULATOR_URL;
  }
  // For web, use standard localhost
  else if (typeof window !== 'undefined') {
    console.log('🌐 Web browser detected - using localhost');
    baseUrl = DEV_API_URL;
  }
  // For iOS simulator, use LOCAL_NETWORK_IP instead of localhost
  else if (Platform.OS === 'ios') {
    console.log('📱 iOS simulator detected - using LOCAL_NETWORK_IP');
    baseUrl = LOCAL_NETWORK_API_URL;
  }
  // Fallback to the local network IP for other cases
  else {
    console.log('📡 Other platform - using local network IP');
    baseUrl = LOCAL_NETWORK_API_URL;
  }

  // Normalize the baseUrl to ensure it doesn't have duplicate /api
  if (baseUrl.endsWith('/api/api')) {
    baseUrl = baseUrl.slice(0, -4); // Remove duplicate /api
  }

  return baseUrl;
})();

// Check API path configuration on startup
const validateApiConfig = () => {
  console.log(`📍 Selected API URL: ${API_URL}`);
  
  if (API_URL.endsWith('/api')) {
    console.log('✅ API URL properly ends with /api');
  } else {
    console.warn('⚠️ API URL does not end with /api, which may cause endpoint issues');
  }
  
  // Test example endpoint paths
  const exampleEndpoints = [
    '/chats/astrologer',
    '/api/chats/astrologer',
    'chats/astrologer',
  ];
  
  console.log('Example endpoints when combined with API_URL:');
  exampleEndpoints.forEach(endpoint => {
    const normalizedEndpoint = endpoint.startsWith('/api') && API_URL.endsWith('/api')
      ? endpoint.substring(4)
      : endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    console.log(`  - ${endpoint} → ${API_URL}${normalizedEndpoint}`);
  });
};

// Run validation in development
if (__DEV__) {
  validateApiConfig();
}

// App identifier - consistent across the app
export const APP_IDENTIFIER = 'astrologer-app';

// Agora settings
export const AGORA = {
  APP_ID: '25b98d94bee34f4eaac05a5e46a733ba',
  APP_CERTIFICATE: ''
};

// API endpoints for consultation-related functionality
export const API_ENDPOINTS = {
  // Auth endpoints
  AUTH: {
    LOGIN: '/auth/login',
    OTP_REQUEST: '/auth/request-otp',
    OTP_VERIFY: '/auth/verify-otp',
    ME: '/auth/me'
  },
  
  // Profile endpoints - try these in order
  PROFILE: [
    '/astrologers/profile',
    '/profile/astrologer',
    '/auth/me',
    '/user/profile',
    '/debug/auth-me'
  ],
  
  // Chat endpoints - updated to match both models
  CHATS: {
    ENDPOINTS: [
      '/api/chat',  // Primary endpoint for astrologer chats
      '/api/chat/chatrooms',   // Primary endpoint for chatrooms
      '/api/chat/messages',    // Endpoint for messages
      '/api/chats'            // Fallback endpoint
    ],
    SOCKET_EVENTS: {
      MESSAGE: 'message',
      TYPING: 'typing',
      READ: 'read'
    }
  },
  
  // Consultation endpoints - try these in order
  CONSULTATIONS: [
    '/consultations',
    '/consultations/astrologer',
    '/astrologer/consultations',
    '/bookings/consultations',
    '/booking-requests/astrologer',
    '/bookings/me'
  ],
  
  // Bookings endpoints - try these in order
  BOOKINGS: [
    '/bookings/astrologer/me',
    '/bookings/astrologer',
    '/bookings/me',
    '/booking-requests/astrologer',
    '/astrologer/bookings'
  ]
};

export default {
  API_URL,
  DEV_API_URL,
  PROD_API_URL,
  LOCAL_NETWORK_API_URL,
  APP_IDENTIFIER,
  API_ENDPOINTS,
  AGORA
}; 