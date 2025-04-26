/**
 * MOBILE DEVICE CONFIG - Copy this file to config.ts when testing on a real device
 * This file is optimized for direct installation on a mobile device connecting to your computer
 */

import { Platform } from 'react-native';

// Update this to your computer's IP address on your local network
export const LOCAL_IP = '192.168.29.231';
export const API_PORT = '3002';

// Default to localhost for web development
export const DEV_API_URL = `http://localhost:${API_PORT}/api`;

// For development on actual devices (need local network IP)
export const LOCAL_NETWORK_API_URL = `http://${LOCAL_IP}:${API_PORT}/api`;

// For Android emulator, 10.0.2.2 points to host's localhost
export const ANDROID_EMULATOR_URL = `http://10.0.2.2:${API_PORT}/api`;

// Production API URL
export const PROD_API_URL = 'https://your-production-api.com/api';

// ** MOBILE DEVICE SPECIFIC CONFIG **
// This is a simplified version that prioritizes direct connection to your computer's IP
export const API_URL = LOCAL_NETWORK_API_URL;

// Output API URL for debugging
console.log('🔴 MOBILE DEVICE CONFIG: Using API URL:', API_URL);

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
  
  // Consultation endpoints - try these in order
  CONSULTATIONS: [
    '/consultations',
    '/consultations/astrologer',
    '/astrologer/consultations',
    '/bookings/consultations'
  ],
  
  // Bookings endpoints - try these in order
  BOOKINGS: [
    '/bookings/astrologer/me',
    '/bookings/astrologer',
    '/bookings/me',
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