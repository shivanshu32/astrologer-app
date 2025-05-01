import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_URL, APP_IDENTIFIER, API_PORT, LOCAL_IP } from '../config';
import { API_ENDPOINTS } from '../config';

// Add more detailed logging for API calls to debug the endpoints
const isDev = __DEV__;

// Display initialization message in dev
if (isDev) {
  console.log('API Service Initializing with URL:', API_URL);
  console.log('App Identifier:', APP_IDENTIFIER);
  console.log('Platform:', Platform.OS);
  
  // Check if API_URL already has /api at the end
  if (API_URL.endsWith('/api')) {
    console.warn('WARNING: API_URL already ends with /api - this could cause duplicate /api in endpoints');
  }
}

// Helper to ensure URLs don't have duplicate /api prefixes
const normalizeUrl = (url: string): string => {
  if (!url) return url;
  
  // If the API_URL already ends with /api and the URL starts with /api, remove the duplicate
  if (API_URL.endsWith('/api') && url.startsWith('/api')) {
    return url.substring(4); // Remove the leading /api
  }
  
  // If URL doesn't start with /, add it
  if (!url.startsWith('/')) {
    return `/${url}`;
  }
  
  return url;
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000, // Increased timeout for slower connections
  headers: {
    'Content-Type': 'application/json',
    'X-App-Identifier': APP_IDENTIFIER, // Add app identifier to every request
    'User-Agent': 'astrologer-app-mobile', // Add explicit user agent
    'X-App-Platform': Platform.OS // Add platform info
  },
});

// Add a request interceptor to normalize URL paths
api.interceptors.request.use(
  async (config) => {
    // Normalize URL to prevent duplicate /api prefixes
    if (config.url) {
      config.url = normalizeUrl(config.url);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
  { runWhen: (config) => Boolean(config.url) }
);

// Helper function to extract the correct astrologer ID
const getStoredAstrologerId = async (): Promise<string | null> => {
  try {
    // First try to get from profile in AsyncStorage
    const astrologerProfileString = await AsyncStorage.getItem('astrologerProfile');
    if (astrologerProfileString) {
      const profile = JSON.parse(astrologerProfileString);
      if (profile && profile._id) {
        return profile._id;
      }
    }

    // Then try from direct astrologerId storage
    const directId = await AsyncStorage.getItem('astrologerId');
    if (directId) {
      return directId;
    }

    // Then try from userData
    const userDataString = await AsyncStorage.getItem('userData');
    if (userDataString) {
      const userData = JSON.parse(userDataString);
      if (userData && (userData.astrologerId || userData._id || userData.id)) {
        return userData.astrologerId || userData._id || userData.id;
      }
    }

    // Finally try from user
    const userString = await AsyncStorage.getItem('user');
    if (userString) {
      const user = JSON.parse(userString);
      if (user && (user.astrologerId || user._id || user.id)) {
        return user.astrologerId || user._id || user.id;
      }
    }

    return null;
  } catch (err) {
    console.error('Error getting astrologer ID:', err);
    return null;
  }
};

// Add a request interceptor to add the auth token to requests
api.interceptors.request.use(
  async (config) => {
    try {
      // Only log specific important requests, not booking requests
      const isBookingRequest = config.url?.includes('booking-requests');
      if (isDev && !isBookingRequest) {
        console.log(`Making API request to: ${config.url}`);
        
        // Add extended debugging for specific request types
        if (config.url?.includes('consultations') || config.url?.includes('bookings')) {
          console.log('Full request details:', {
            method: config.method,
            url: config.url,
            baseURL: config.baseURL,
            params: config.params
          });
        }
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

      // Add astrologer ID to requests to help backend identify the correct user
      // This is particularly important for chat and booking operations
      const astrologerId = await getStoredAstrologerId();
      if (astrologerId) {
        // Always add the astrologer ID to headers for all requests
        config.headers['X-Astrologer-ID'] = astrologerId;
        config.headers['X-App-Identifier'] = APP_IDENTIFIER;
        
        // For chat-specific endpoints, add even more ID headers
        if (config.url?.includes('/chat') || config.url?.includes('/messages') || config.url?.includes('/booking')) {
          console.log(`Adding astrologer ID ${astrologerId} to request headers for chat/booking operation`);
          config.headers['X-User-ID'] = astrologerId;
          config.headers['X-Sender-ID'] = astrologerId;
          
          // If this is a POST request to send a message, add ID to the body as well
          if (config.method?.toLowerCase() === 'post' && 
              (config.url?.includes('/messages') || config.url?.includes('/send'))) {
            // Ensure data is an object
            if (!config.data) {
              config.data = {};
            } else if (typeof config.data === 'string') {
              try {
                config.data = JSON.parse(config.data);
              } catch (e) {
                console.error('Error parsing request data as JSON:', e);
              }
            }
            
            // Add ID to the data if it's an object
            if (typeof config.data === 'object') {
              config.data.senderId = astrologerId;
              config.data.astrologerId = astrologerId;
            }
          }
        }
      } else {
        console.warn('No astrologer ID available for request headers');
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
      
      // If consultations or bookings, log more details
      if (response.config.url?.includes('consultations') || response.config.url?.includes('bookings')) {
        console.log('Response data preview:', 
          response.data ? 
            (Array.isArray(response.data.data) ? 
              `${response.data.data.length} items` : 
              'Single item') : 
            'No data'
        );
      }
    }
    return response;
  },
  (error) => {
    // Always log errors
    console.error('API response error:', error.message, error.config?.url);
    
    // Enhanced error logging for network errors
    if (error.message.includes('Network Error')) {
      console.error('NETWORK ERROR DETAILS:');
      console.error('- API URL:', API_URL);
      console.error('- Endpoint:', error.config?.url);
      console.error('- Method:', error.config?.method);
      console.error('- Headers:', JSON.stringify(error.config?.headers || {}));
      console.error('- Data:', JSON.stringify(error.config?.data || {}));
      console.error('Check if the server is running and accessible at this address');
    }
    
    // Log more details for auth errors
    if (error.response?.status === 401) {
      console.error('Authentication error - token might be invalid or expired');
      // You could trigger automatic logout here if needed
    }
    
    if (error.response) {
      console.error('Error status:', error.response.status);
      console.error('Error data:', error.response.data);
      
      // Log even more details for consultations/bookings endpoints
      if (error.config?.url?.includes('consultations') || error.config?.url?.includes('bookings')) {
        console.error('Detailed request config:', {
          method: error.config.method,
          url: error.config.url,
          baseURL: error.config.baseURL,
          headers: error.config.headers,
          params: error.config.params
        });
      }
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
      console.log(`Using API URL: ${API_URL}`);
    }
    
    try {
      // Try normal API call first
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
    } catch (error: any) {
      // If we get a network error, try direct axios call with different URLs
      if (error.message && error.message.includes('Network Error')) {
        console.log('Network error using API. Trying direct axios calls with alternate URLs...');
        
        // Try different URLs based on platform
        const urlsToTry = [
          `http://10.0.2.2:${API_PORT.split('/').pop()}/api/auth/verify-otp`, // Android emulator
          `http://${LOCAL_IP}:${API_PORT.split('/').pop()}/api/auth/verify-otp`, // Local network
          `http://localhost:${API_PORT.split('/').pop()}/api/auth/verify-otp` // Standard localhost
        ];
        
        // Add IP logging for debugging
        if (Platform.OS === 'android') {
          console.log('Running on Android, recommended URL is 10.0.2.2 for emulator');
        }
        
        // Try each URL
        for (const url of urlsToTry) {
          try {
            console.log(`Trying direct API call to: ${url}`);
            const directResponse = await axios.post(url, {
              mobileNumber,
              otp,
              appIdentifier: APP_IDENTIFIER
            }, {
              headers: {
                'Content-Type': 'application/json',
                'X-App-Identifier': APP_IDENTIFIER,
                'User-Agent': 'astrologer-app-mobile',
                'X-App-Platform': Platform.OS
              },
              timeout: 10000
            });
            
            if (directResponse.data && directResponse.data.success) {
              console.log(`Success with direct call to ${url}`);
              return directResponse.data;
            }
          } catch (directError: any) {
            console.log(`Error with ${url}:`, directError.message || 'Unknown error');
          }
        }
        
        // If all direct calls fail, throw the original error
        throw error;
      } else {
        // Not a network error, rethrow
        throw error;
      }
    }
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

// Profile service for astrologer profile operations
export const profileService = {
  // Get astrologer profile
  getProfile: async () => {
    try {
      // Try the primary endpoint first
      const response = await api.get(API_ENDPOINTS.PROFILE[0]);
      
      if (response.data && response.data.success) {
        console.log('Profile successfully retrieved');
        return response.data.data;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error getting profile:', error);
      throw error;
    }
  },
  
  // Update astrologer profile
  updateProfile: async (profileData: any) => {
    try {
      const response = await api.put(API_ENDPOINTS.PROFILE[0], profileData);
      
      if (response.data && response.data.success) {
        console.log('Profile successfully updated');
        return response.data.data;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }
};

export default api; 