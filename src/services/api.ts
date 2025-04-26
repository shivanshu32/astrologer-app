import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Define API URLs for different environments
const LOCAL_NETWORK_IP = '192.168.29.231'; // Update this to your computer's local IP address
const LOCAL_PORT = '3002';

// Choose URL based on environment
let API_URL = `http://localhost:${LOCAL_PORT}/api`;

// If running on a physical device, use the local network IP instead of localhost
if (Platform.OS !== 'web' && !__DEV__) {
  // Production
  API_URL = 'https://your-production-api.com/api';
} else if (Platform.OS !== 'web') {
  // Development on device
  API_URL = `http://${LOCAL_NETWORK_IP}:${LOCAL_PORT}/api`;
}

// App identifier to tell backend which app is making the request
export const APP_IDENTIFIER = 'astrologer-app';

// Only log in development
const isDev = __DEV__;

// Only display initialization message in dev
if (isDev) {
  console.log('Using API URL:', API_URL);
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000, // Increased timeout for slower connections
  headers: {
    'Content-Type': 'application/json',
    'X-App-Identifier': APP_IDENTIFIER // Add app identifier to every request
  },
});

// Add a request interceptor to add the auth token to requests
api.interceptors.request.use(
  async (config) => {
    try {
      // Only log specific important requests, not booking requests
      const isBookingRequest = config.url?.includes('booking-requests');
      if (isDev && !isBookingRequest) {
        console.log(`Making API request to: ${config.url}`);
      }
      
      const token = await AsyncStorage.getItem('token');
      
      if (token) {
        // Debug token format only in dev and not for booking requests
        if (isDev && !isBookingRequest) {
          console.log(`Token in use (first 10 chars): ${token.substring(0, 10)}...`);
          
          // Basic token format validation
          const tokenParts = token.split('.');
          if (tokenParts.length !== 3) {
            console.warn('WARNING: Token does not appear to be in valid JWT format (should have 3 parts)');
          }
        }
        
        config.headers.Authorization = `Bearer ${token}`;
      } else if (isDev) {
        console.log('No auth token available for request');
      }
    } catch (error) {
      console.error('Error setting auth token:', error);
    }
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => {
    // Don't log booking request responses
    const isBookingRequest = response.config.url?.includes('booking-requests');
    if (isDev && !isBookingRequest) {
      console.log('API response success:', response.config.url);
    }
    return response;
  },
  (error) => {
    // Always log errors
    console.error('API response error:', error.message, error.config?.url);
    
    // Log more details for auth errors
    if (error.response?.status === 401) {
      console.error('Authentication error - token might be invalid or expired');
      // You could trigger automatic logout here if needed
    }
    
    if (error.response) {
      console.error('Error status:', error.response.status);
      console.error('Error data:', error.response.data);
    }
    
    return Promise.reject(error);
  }
);

// Auth APIs
export const loginWithEmail = async (email: string, password: string) => {
  try {
    const response = await api.post('/auth/login', { 
      email, 
      password,
      appIdentifier: APP_IDENTIFIER
    });
    return response.data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

export const loginWithOTP = async (mobileNumber: string, otp: string) => {
  try {
    if (isDev) {
      console.log(`Attempting OTP login with mobile: ${mobileNumber}`);
    }
    const response = await api.post('/auth/verify-otp', { 
      mobileNumber, 
      otp,
      appIdentifier: APP_IDENTIFIER
    });
    
    // Validate the token in the response
    if (response.data && response.data.token && isDev) {
      console.log('Received token from server:', response.data.token ? `${response.data.token.substring(0, 15)}...` : 'null');
    } else if (isDev) {
      console.warn('No token received in verify-otp response');
    }
    
    return response.data;
  } catch (error) {
    console.error('OTP verification error:', error);
    throw error;
  }
};

export const requestOTP = async (mobileNumber: string) => {
  try {
    const response = await api.post('/auth/request-otp', { 
      mobileNumber,
      appIdentifier: APP_IDENTIFIER
    });
    return response.data;
  } catch (error) {
    console.error('OTP request error:', error);
    throw error;
  }
};

export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data;
  } catch (error) {
    console.error('Get current user error:', error);
    throw error;
  }
};

export default api; 