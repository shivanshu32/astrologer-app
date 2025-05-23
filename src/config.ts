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

  // Normalize the baseUrl to ensure it has exactly one /api suffix
  // First remove any duplicate /api/api patterns
  baseUrl = baseUrl.replace(/\/api\/api/g, '/api');
  
  // Then ensure it ends with exactly one /api
  if (!baseUrl.endsWith('/api')) {
    baseUrl = `${baseUrl}${baseUrl.endsWith('/') ? 'api' : '/api'}`;
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

// Socket URL configuration - derived from API_URL
export const SOCKET_URL = (() => {
  // Remove /api from API_URL to get the base server URL
  const baseServerUrl = API_URL.endsWith('/api')
    ? API_URL.slice(0, -4) // Remove /api suffix
    : API_URL.replace('/api/', '/'); // Replace /api/ with /
    
  console.log(`🔌 Socket URL: ${baseServerUrl}`);
  return baseServerUrl;
})();

// For local network testing with actual devices
export const LOCAL_NETWORK_SOCKET_URL = `http://${LOCAL_IP}:${API_PORT}`;

// Agora settings
export const AGORA = {
  APP_ID: '25b98d94bee34f4eaac05a5e46a733ba',
  APP_CERTIFICATE: ''
};

// API endpoints for consultation-related functionality
export const API_ENDPOINTS = {
  // Auth endpoints - updated for astrologer-specific routes
  AUTH: {
    LOGIN: '/astrologer-auth/login',  // Primary endpoint for astrologer login
    OTP_REQUEST: '/auth/request-otp', // Standard OTP request endpoint
    OTP_VERIFY: '/auth/verify-otp',   // Standard OTP verify endpoint
    ME: '/astrologer-auth/me',        // Astrologer-specific profile endpoint
    VERIFY_MOBILE: '/astrologer-auth/verify-mobile', // Verify if mobile is registered as astrologer
    DEBUG: '/astrologer-auth/debug'   // Debug endpoint to test route access
  },
  
  // Profile endpoints - try these in order (prioritize astrologer-specific routes)
  PROFILE: [
    '/astrologer-auth/profile',  // Primary endpoint for astrologer profile
    '/astrologer-auth/me',       // Alternative for profile data
    '/astrologers/profile',      // Legacy endpoint
    '/profile/astrologer',       // Another possible endpoint
    '/auth/me',                  // Generic user profile
    '/user/profile',             // Alternative user profile
    '/debug/auth-me'             // Debug endpoint
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

// Document the available astrologer auth routes for debugging
if (__DEV__) {
  console.log('\n=== ASTROLOGER AUTH ROUTES ===');
  console.log('Available endpoints:');
  console.log('- Debug route: /api/astrologer-auth/debug');
  console.log('- Login: /api/astrologer-auth/login');
  console.log('- Verify mobile: /api/astrologer-auth/verify-mobile/:mobileNumber');
  console.log('- Get profile: /api/astrologer-auth/me');
  console.log('- Detailed profile: /api/astrologer-auth/profile');
  console.log('=============================\n');
}

export default {
  API_URL,
  DEV_API_URL,
  PROD_API_URL,
  LOCAL_NETWORK_API_URL,
  APP_IDENTIFIER,
  API_ENDPOINTS,
  AGORA
}; 