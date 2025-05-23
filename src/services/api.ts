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
  
  // Check for http:// or https:// at the beginning (full URLs)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url; // Don't modify full URLs
  }
  
  // If the API_URL already ends with /api and the URL starts with /api, remove the duplicate
  if (API_URL.endsWith('/api') && url.startsWith('/api')) {
    console.log(`🔀 Converted endpoint ${url} to ${url.substring(4)}`);
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

// Configure request interceptor to add auth token to all requests
api.interceptors.request.use(
  async (config) => {
    try {
      // First, try to get the JWT token
      const token = await AsyncStorage.getItem('token');
      
      // Add auth token if available
      if (token) {
        // Set authorization header
        config.headers.Authorization = `Bearer ${token}`;
      }
      
      // Always set app identifier
      config.headers['X-App-Identifier'] = APP_IDENTIFIER;
      
      // Always add content type if not already set
      if (!config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
      }
      
      // Get the astrologer ID for request headers
      const astrologerId = await getStoredAstrologerId();
      
      if (astrologerId) {
        // Always add the astrologer ID to headers for all requests
        config.headers['X-Astrologer-ID'] = astrologerId;
        
        // For chat-specific endpoints, add even more ID headers
        if (config.url?.includes('/chat') || config.url?.includes('/messages') || config.url?.includes('/booking')) {
          // Enhanced logging for chat endpoints
          console.log(`🔄 CHAT REQUEST: ${config.method?.toUpperCase()} ${API_URL}${config.url}`);
          console.log(`👤 Astrologer ID: ${astrologerId}`);
          
          if (token) {
            console.log(`🔑 Token: ${token.substring(0, 15)}...`);
          }
          
          // Log booking ID if present in the URL
          const bookingIdMatch = config.url?.match(/booking\/([^\/]+)/);
          if (bookingIdMatch && bookingIdMatch[1]) {
            console.log(`📋 Booking ID: ${bookingIdMatch[1]}`);
          }
          
          if (config.data) {
            const dataLog = typeof config.data === 'string' ? 
              JSON.parse(config.data) : config.data;
            
            if (dataLog.bookingId) {
              console.log(`📋 Booking ID from payload: ${dataLog.bookingId}`);
            }
            
            // Only log message type, not content for privacy
            if (dataLog.message) {
              console.log(`💬 Message type: ${dataLog.messageType || 'text'}`);
            }
          }
          
          console.log(`🔧 Headers: X-Astrologer-ID, X-App-Identifier, Authorization`);
          
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
              
              // Ensure we always set senderType for messages
              if (config.url?.includes('/messages') && !config.data.senderType) {
                config.data.senderType = 'astrologer';
              }
            }
          }
          
          // If the URL already has /api, no need to modify
          if (!config.url?.startsWith('/api') && !config.url?.includes('://')) {
            // Try with /api prefix first (we handle fallbacks in the individual service methods)
            const originalUrl = config.url;
            config.url = `/api${originalUrl}`;
            console.log(`🔀 Converted endpoint ${originalUrl} to ${config.url}`);
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
    
    // Enhanced logging for chat endpoints
    if (response.config.url?.includes('/chat') || 
        response.config.url?.includes('/messages') || 
        response.config.url?.includes('/booking')) {
      console.log(`✅ CHAT RESPONSE: ${response.config.method?.toUpperCase()} ${API_URL}${response.config.url}`);
      console.log(`⏱️ Response time: ${response.headers['x-response-time'] || 'N/A'}`);
      
      // Log data summary, not all data
      if (response.data) {
        if (response.data.data && Array.isArray(response.data.data)) {
          console.log(`📊 Received ${response.data.data.length} items`);
        } else if (response.data.success) {
          console.log(`🔄 Success: ${response.data.success}`);
        }
        
        // Log chat ID if present
        if (response.data.data && response.data.data._id) {
          console.log(`💬 Chat ID: ${response.data.data._id}`);
        } else if (response.data.data && response.data.data.chatId) {
          console.log(`💬 Chat ID: ${response.data.data.chatId}`);
        }
      }
    }
    else if (isDev && !isBookingRequest) {
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
      // Use the astrologer-specific endpoint from API_ENDPOINTS 
      const response = await api.post(API_ENDPOINTS.AUTH.LOGIN, { 
        mobileNumber, 
        otp
      });
      
      // Validate the token in the response
      if (response.data && response.data.token && isDev) {
        console.log('Received token from server:', response.data.token ? `${response.data.token.substring(0, 15)}...` : 'null');
      } else if (isDev) {
        console.warn('No token received in verify-otp response');
      }
      
      return response.data;
    } catch (error: any) {
      // If the astrologer-specific endpoint fails, fall back to the standard auth
      console.log('Astrologer login failed, trying standard auth endpoint');
      const response = await api.post('/auth/login', { 
        mobileNumber, 
        otp
      });
      return response.data;
    }
  } catch (error: any) {
    console.error('Login with OTP error:', error.message);
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
    // Try the astrologer-specific endpoint first
    try {
      const response = await api.get(API_ENDPOINTS.AUTH.ME);
      return response.data;
    } catch (error) {
      console.log('Astrologer ME endpoint failed, trying standard endpoint');
      const response = await api.get('/auth/me');
      return response.data;
    }
  } catch (error) {
    console.error('Get current user error:', error);
    throw error;
  }
};

// Profile service for astrologer profile operations
export const profileService = {
  // Get astrologer profile with fallback strategy
  getProfile: async () => {
    try {
      console.log('Attempting to get astrologer profile...');
      
      // Try each endpoint in the PROFILE array until one works
      for (const endpoint of API_ENDPOINTS.PROFILE) {
        try {
          console.log(`Trying ${endpoint} endpoint...`);
          const response = await api.get(endpoint);
          
          if (response.data && response.data.success) {
            console.log(`Profile successfully retrieved from ${endpoint}`);
            
            // Different endpoints return data in different formats
            if (endpoint.includes('/me')) {
              return response.data.astrologer || response.data.data;
            } else {
              return response.data.data || response.data.astrologer;
            }
          }
        } catch (error) {
          console.log(`${endpoint} failed, trying next endpoint`);
        }
      }
      
      // Try the debug endpoint as a last resort
      try {
        console.log('Trying fallback endpoint: /astrologers/profile...');
        const response = await api.get('/astrologers/profile');
        
        if (response.data && response.data.success) {
          console.log('Profile successfully retrieved from /astrologers/profile');
          return response.data.data;
        }
      } catch (error) {
        console.log('All profile endpoints failed');
      }
      
      throw new Error('Could not retrieve astrologer profile from any endpoint');
    } catch (error) {
      console.error('Error getting astrologer profile:', error);
      throw error;
    }
  },
  
  // Update astrologer profile with fallback strategy
  updateProfile: async (profileData: any) => {
    try {
      console.log('Attempting to update astrologer profile...');
      
      try {
        console.log('Trying primary endpoint...');
        const response = await api.put(API_ENDPOINTS.PROFILE[0], profileData);
        
        if (response.data && response.data.success) {
          console.log('Profile successfully updated');
          return response.data.data;
        }
      } catch (error) {
        console.log('Primary update endpoint failed, trying alternative');
      }
      
      // Try second endpoint if first fails
      const alternativeResponse = await api.put('/astrologers/profile', profileData);
      
      if (alternativeResponse.data && alternativeResponse.data.success) {
        console.log('Profile successfully updated via alternative endpoint');
        return alternativeResponse.data.data;
      }
      
      throw new Error('All update endpoints failed');
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }
};

export default api; 