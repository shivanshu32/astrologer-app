export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.29.231:3002/api';

// Set this to your actual backend API URL when deploying
export const DEV_API_URL = 'http://localhost:3002/api';
export const PROD_API_URL = 'https://your-production-api.com/api';

// Use for development on mobile devices
export const LOCAL_NETWORK_API_URL = 'http://192.168.29.231:3002/api';

// Agora settings
export const AGORA = {
  APP_ID: '25b98d94bee34f4eaac05a5e46a733ba',
  APP_CERTIFICATE: ''
};

export default {
  API_URL,
  DEV_API_URL,
  PROD_API_URL,
  LOCAL_NETWORK_API_URL,
  AGORA
}; 