import api, { profileService } from './api';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, APP_IDENTIFIER, LOCAL_IP, API_PORT, API_ENDPOINTS } from '../config';
import { Platform } from 'react-native';

export interface BookingRequest {
  _id: string;
  userId: {
    _id: string;
    name: string;
    profileImage?: string;
  } | string;
  astrologerId: string;
  consultationType: 'chat' | 'call' | 'video';
  status: 'pending' | 'accepted' | 'declined';
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookingRequestResponse {
  success: boolean;
  data: BookingRequest;
  message: string;
}

export interface BookingRequestListResponse {
  success: boolean;
  data: BookingRequest[];
  message: string;
}

/**
 * Debug utility to decode and examine the JWT token
 */
export const debugToken = async (): Promise<void> => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      console.log('No token found in AsyncStorage');
      return;
    }
    
    console.log('Token found:', token.substring(0, 15) + '...');
    
    // Decode JWT payload (second part of token)
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('Invalid token format, should have 3 parts');
      return;
    }
    
    try {
      // Decode base64 payload
      const payload = JSON.parse(atob(parts[1]));
      console.log('Decoded token payload:', payload);
      console.log('User ID:', payload.id);
      console.log('Mobile Number:', payload.mobileNumber);
      console.log('User Type:', payload.userType);
      console.log('Token Expiry:', new Date(payload.exp * 1000).toLocaleString());
    } catch (e) {
      console.log('Error decoding token payload:', e);
    }
  } catch (error) {
    console.error('Error in debugToken:', error);
  }
};

/**
 * Get the current astrologer profile
 * @returns The astrologer profile or null if not found
 */
export const getAstrologerProfile = async (): Promise<any> => {
  try {
    console.log('Fetching astrologer profile...');
    
    // First try using profileService
    try {
      return await profileService.getProfile();
    } catch (apiError: any) {
      console.log('Error fetching astrologer profile with profileService:', apiError.message);
    }
    
    // Try using direct API call if the first method fails
    const endpoints = API_ENDPOINTS.PROFILE;
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying direct API call to ${endpoint}`);
        const response = await directApiCall(endpoint);
        
        if (response && response.success) {
          // For our new debug endpoint, the response format is different
          if (endpoint === '/debug/auth-me') {
            if (response.astrologer) {
              console.log(`Astrologer profile found via debug endpoint:`, response.astrologer);
              return response.astrologer;
            } else {
              console.log('Debug endpoint found user but no astrologer profile:', response.user);
              return null;
            }
          }
          
          // For standard endpoints
          console.log(`Astrologer profile found via direct call to ${endpoint}:`, response.data);
          return response.data;
        }
      } catch (directError: any) {
        console.log(`Error fetching astrologer profile from ${endpoint}:`, directError.message);
        // Continue to next endpoint
      }
    }
    
    console.log('No astrologer profile found after trying all endpoints');
    // Try direct call to debug user information
    try {
      console.log('Trying debug auth-me endpoint as last resort...');
      const debugResponse = await directApiCall('/debug/auth-me');
      
      if (debugResponse && debugResponse.success) {
        console.log('Debug endpoint response:', debugResponse);
        
        if (debugResponse.astrologer) {
          console.log('Found astrologer profile via debug endpoint');
          return debugResponse.astrologer;
        }
        
        console.log('User information found but no astrologer profile:', debugResponse.user);
        console.log('Mobile number from user profile:', debugResponse.user.mobileNumber);
        
        // If we have user info, check if there might be a mobile number mismatch
        if (debugResponse.user.mobileNumber) {
          console.log(`If you've registered as an astrologer but can't see your profile, check if your mobile number ${debugResponse.user.mobileNumber} matches what's in the astrologer registration.`);
        }
      }
    } catch (debugError: any) {
      console.log('Could not fetch user information from debug endpoint:', debugError.message);
    }
    
    return null;
  } catch (error) {
    console.error('Error in getAstrologerProfile:', error);
    return null;
  }
};

// Implement retry functionality for API calls
async function withRetry<T>(fn: () => Promise<T>, retryCount = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retryCount <= 0) throw error;
    
    console.log(`API call failed, retrying in ${delay}ms... (${retryCount} attempts left)`);
    
    // Wait for delay milliseconds
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry with exponential backoff
    return withRetry(fn, retryCount - 1, delay * 2);
  }
}

// Direct API caller to bypass possible middleware issues
async function directApiCall(endpoint: string, method = 'get', data?: any) {
  try {
    const token = await AsyncStorage.getItem('token');
    const config = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER,
        'User-Agent': 'astrologer-app-mobile',
        'X-App-Platform': Platform.OS
      },
      timeout: 15000
    };
    
    // Set the port to 3002 for local development
    const localPort = 3002;
    
    // Create an array of base URLs to try
    const baseUrls = [
      API_URL, // Try the configured API URL first
      `http://10.0.2.2:${localPort}/api`, // Android emulator special IP with correct port
      `http://${LOCAL_IP}:${localPort}/api`, // Local network IP with correct port
      `http://localhost:${localPort}/api`, // Standard localhost with correct port
      'https://api.jyotish.app/api' // Production API URL
    ];
    
    // Loop through each base URL
    for (const baseUrl of baseUrls) {
      try {
        console.log(`Making direct ${method.toUpperCase()} request to: ${baseUrl}${endpoint}`);
        let response;
        
        if (method.toLowerCase() === 'get') {
          response = await axios.get(`${baseUrl}${endpoint}`, config);
        } else if (method.toLowerCase() === 'post') {
          response = await axios.post(`${baseUrl}${endpoint}`, data, config);
        } else if (method.toLowerCase() === 'put') {
          response = await axios.put(`${baseUrl}${endpoint}`, data, config);
        }
        
        if (response?.data) {
          console.log(`✅ Successful API call to ${baseUrl}${endpoint}`);
          return response.data;
        }
      } catch (urlError: any) {
        console.log(`❌ Failed call to ${baseUrl}${endpoint}: ${urlError.message}`);
        // Continue to next URL if this one fails
      }
    }
    
    // If all URLs fail, throw an error
    throw new Error(`All API URLs failed for ${endpoint}`);
  } catch (error: any) {
    console.error(`Direct API call to ${endpoint} failed:`, error.message);
    throw error;
  }
}

/**
 * Get booking requests by astrologer ID
 * @param astrologerId The ID of the astrologer
 * @returns Array of booking requests
 */
export const getBookingRequestsByAstrologerId = async (astrologerId: string): Promise<BookingRequest[]> => {
  console.log(`Fetching booking requests for astrologer ID: ${astrologerId}`);
  
  try {
    // First try using normal API method
    try {
      const response = await api.get(`/booking-requests/astrologer/${astrologerId}`);
      
      if (response.data && response.data.success) {
        console.log(`Successfully fetched ${response.data.data.length} booking requests for astrologer ID`);
        return response.data.data;
      }
    } catch (apiError: any) {
      console.error('API method failed for astrologer ID fetch:', apiError.message);
    }
    
    // Try direct API call with different endpoints
    const endpoints = [
      `/booking-requests/astrologer/${astrologerId}`,
      `/astrologer/${astrologerId}/booking-requests`,
      `/bookings/astrologer/${astrologerId}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying direct API call to ${endpoint}`);
        const response = await directApiCall(endpoint);
        
        if (response && (response.success || Array.isArray(response.data || response))) {
          const data = response.data || response;
          console.log(`Successfully fetched ${Array.isArray(data) ? data.length : '1'} booking requests via direct API`);
          return Array.isArray(data) ? data : [data];
        }
      } catch (endpointError: any) {
        console.error(`Endpoint ${endpoint} failed:`, endpointError.message);
        // Continue to next endpoint
      }
    }
    
    // If all direct calls fail, try debug method
    try {
      console.log('Trying debug endpoint for booking requests');
      const response = await axios.get(`${API_URL}/debug/bookings-by-astrologer/${astrologerId}`, {
        headers: {
          'Authorization': `Bearer ${await AsyncStorage.getItem('token')}`,
          'Content-Type': 'application/json',
          'X-App-Identifier': APP_IDENTIFIER
        }
      });
      
      if (response.data && response.data.success) {
        console.log(`Successfully fetched ${response.data.data.length} booking requests via debug endpoint`);
        return response.data.data;
      }
    } catch (debugError: any) {
      console.error('Debug endpoint failed:', debugError.message);
    }
    
    // If all methods fail, return empty array
    console.warn('All endpoints failed, returning empty array');
    return [];
  } catch (error) {
    console.error('Error fetching booking requests by astrologer ID:', error);
    return [];
  }
};

/**
 * Get all booking requests for the logged-in astrologer
 * @returns Array of booking requests
 */
export const getMyBookingRequests = async (): Promise<BookingRequest[]> => {
  console.log('Fetching booking requests with retry mechanism');
  
  // First check if token has correct info
  await debugToken();
  
  // Then check if astrologer profile exists
  const profile = await getAstrologerProfile();
  if (!profile) {
    console.warn('⚠️ No astrologer profile found. This could be why booking requests are not showing.');
    console.warn('Check if the astrologer registration is complete or the mobile number matches.');
  } else {
    console.log('✅ Found astrologer profile with ID:', profile._id);
    console.log('👤 Mobile number in profile:', profile.mobile);
    
    // If we have the astrologer ID, try to fetch directly with it
    try {
      return await getBookingRequestsByAstrologerId(profile._id);
    } catch (astrologerIdError) {
      console.error('Error fetching by astrologer ID:', astrologerIdError);
      // Fall through to regular methods
    }
  }
  
  try {
    // Try using normal API method with retry
    return await withRetry(async () => {
      const response = await api.get('/booking-requests/astrologer');
      
      if (response.data && response.data.success) {
        console.log(`Successfully fetched ${response.data.data.length} booking requests`);
        return response.data.data;
      } else {
        throw new Error('Unexpected API response format');
      }
    });
  } catch (apiError) {
    console.error('API method failed after retries, trying direct API call:', apiError);
    
    // Try getting astrologer ID from AsyncStorage
    try {
      const astrologerId = await AsyncStorage.getItem('astrologerId');
      if (astrologerId) {
        console.log('Found astrologer ID in AsyncStorage:', astrologerId);
        return await getBookingRequestsByAstrologerId(astrologerId);
      }
    } catch (asyncStorageError) {
      console.error('Error getting astrologer ID from AsyncStorage:', asyncStorageError);
    }
    
    try {
      // Try alternative endpoints
      const endpoints = [
        '/booking-requests/astrologer',
        '/booking-requests/me',
        '/astrologer/booking-requests'
      ];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying direct API call to ${endpoint}`);
          const response = await directApiCall(endpoint);
          
          if (response && (response.success || Array.isArray(response.data || response))) {
            const data = response.data || response;
            console.log(`Successfully fetched ${Array.isArray(data) ? data.length : '1'} booking requests via direct API`);
            return Array.isArray(data) ? data : [data];
          }
        } catch (endpointError: any) {
          console.error(`Endpoint ${endpoint} failed:`, endpointError.message);
          // Continue to next endpoint
        }
      }
      
      // If all direct calls fail, return empty array
      console.warn('All direct API calls failed, returning empty array');
      return [];
    } catch (directError) {
      console.error('Direct API call failed:', directError);
      return [];
    }
  }
};

/**
 * Get booking requests filtered by status
 * @param status - Optional status to filter by ('pending', 'accepted', 'rejected', etc.)
 * @returns Array of filtered booking requests
 */
export const getFilteredBookingRequests = async (status?: string): Promise<BookingRequest[]> => {
  console.log(`Fetching booking requests with status filter: ${status || 'all'}`);
  try {
    // Get all requests and filter client-side
    const allRequests = await getMyBookingRequests();
    
    // Apply status filter if provided
    if (status) {
      console.log(`Filtering ${allRequests.length} requests for status: ${status}`);
      return allRequests.filter(req => req.status === status);
    }
    
    return allRequests;
  } catch (error) {
    console.error('Error fetching filtered booking requests:', error);
    return [];
  }
};

/**
 * Accept a booking request
 * @param bookingId - The ID of the booking request to accept
 * @returns The updated booking request
 */
export const acceptBookingRequest = async (bookingId: string): Promise<BookingRequest> => {
  console.log(`Accepting booking request: ${bookingId}`);
  try {
    // First try using normal API method with retry
    return await withRetry(async () => {
      const token = await AsyncStorage.getItem('token');
      const response = await api.put(`/booking-requests/${bookingId}/accept`, {}, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-Identifier': APP_IDENTIFIER,
          'User-Agent': 'astrologer-app-mobile',
          'X-App-Platform': Platform.OS
        }
      });
      
      if (response.data && response.data.success) {
        console.log('Successfully accepted booking request');
        return response.data.data;
      } else {
        throw new Error('Unexpected API response format');
      }
    });
  } catch (apiError) {
    console.error('API method failed after retries, trying direct API call:', apiError);
    
    try {
      // Try multiple endpoints for accepting booking
      const endpoints = [
        `/booking-requests/${bookingId}/accept`,
        `/api/booking-requests/${bookingId}/accept`,
        `/bookings/${bookingId}/accept`,
        `/api/bookings/${bookingId}/accept`,
        `/booking/${bookingId}/accept`,
        `/api/booking/${bookingId}/accept`
      ];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying to accept booking with endpoint: ${endpoint}`);
          const response = await directApiCall(endpoint, 'put', {});
          
          if (response && (response.success || response.data)) {
            console.log(`Successfully accepted booking request via endpoint: ${endpoint}`);
            return response.data || response;
          }
        } catch (endpointError) {
          console.error(`Failed to accept booking with endpoint ${endpoint}:`, endpointError);
          // Continue to next endpoint
        }
      }
      
      // If all endpoints fail, try with astrologer ID
      try {
        const astrologerId = await AsyncStorage.getItem('astrologerId');
        if (astrologerId) {
          console.log(`Trying to accept booking with astrologer ID: ${astrologerId}`);
          const response = await directApiCall(`/booking-requests/${bookingId}/accept`, 'put', {
            astrologerId
          });
          
          if (response && (response.success || response.data)) {
            console.log('Successfully accepted booking request with astrologer ID');
            return response.data || response;
          }
        }
      } catch (astrologerError) {
        console.error('Failed to accept booking with astrologer ID:', astrologerError);
      }
      
      throw new Error('All booking acceptance endpoints failed');
    } catch (directError) {
      console.error('Failed to accept booking request:', directError);
      throw directError;
    }
  }
};

/**
 * Decline a booking request
 * @param bookingId - The ID of the booking request to decline
 * @param reason - Optional reason for declining
 * @returns The updated booking request
 */
export const declineBookingRequest = async (bookingId: string, reason?: string): Promise<BookingRequest> => {
  try {
    // First try using normal API method with retry
    return await withRetry(async () => {
      const response = await api.put(`/booking-requests/${bookingId}/decline`, { reason });
      
      if (response.data && response.data.success) {
        console.log('Successfully declined booking request');
        return response.data.data;
      } else {
        throw new Error('Unexpected API response format');
      }
    });
  } catch (apiError) {
    console.error('API method failed after retries, trying direct API call:', apiError);
    
    try {
      // Try direct API call
      const response = await directApiCall(`/booking-requests/${bookingId}/decline`, 'put', { reason });
      
      if (response && (response.success || response.data)) {
        console.log('Successfully declined booking request via direct API');
        return response.data || response;
      }
      
      throw new Error('Direct API call failed with invalid response');
    } catch (directError) {
      console.error('Failed to decline booking request:', directError);
      throw directError;
    }
  }
};

/**
 * Debug function to directly fetch bookings by mobile number
 * This bypasses the astrologer lookup and tries to find booking requests
 * directly using the mobile number from the authenticated user
 */
export const debugDirectBookingFetch = async (): Promise<any> => {
  try {
    console.log('Attempting direct booking fetch by mobile number...');
    
    // First try the new debug/ping endpoint to check basic connectivity
    console.log('Testing basic API connectivity...');
    let apiConnected = false;
    let connectedUrl = '';
    
    // Set the port to 3002 for local development
    const localPort = 3002;
    
    try {
      // Try to ping each base URL
      const baseUrls = [
        API_URL, 
        `http://10.0.2.2:${localPort}/api`, 
        `http://${LOCAL_IP}:${localPort}/api`, 
        `http://localhost:${localPort}/api`,
        'https://api.jyotish.app/api' // Production API URL
      ];
      
      for (const baseUrl of baseUrls) {
        try {
          const pingResponse = await axios.get(`${baseUrl}/debug/ping`, {
            timeout: 5000
          });
          
          if (pingResponse.data && pingResponse.data.success) {
            console.log(`✅ Ping successful to ${baseUrl}`);
            apiConnected = true;
            connectedUrl = baseUrl;
            break;
          }
        } catch (pingError: any) {
          console.log(`❌ Ping failed to ${baseUrl}: ${pingError.message}`);
        }
      }
    } catch (pingAllError) {
      console.log('All ping attempts failed:', pingAllError);
    }
    
    if (!apiConnected) {
      console.log('⚠️ Could not connect to any API URLs. Check your network or server status.');
      return {
        success: false,
        message: 'API connectivity test failed. Unable to connect to any server endpoint.'
      };
    }
    
    console.log(`Using working API URL: ${connectedUrl}`);
    
    // Now try auth-test endpoint to check token validity
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.log('No token found in AsyncStorage');
        return {
          success: false,
          message: 'No authentication token found. Please log in again.'
        };
      }
      
      const authTestResponse = await axios.get(`${connectedUrl}/debug/auth-test`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-Identifier': APP_IDENTIFIER,
          'User-Agent': 'astrologer-app-mobile',
          'X-App-Platform': Platform.OS
        }
      });
      
      if (authTestResponse.data && authTestResponse.data.success) {
        console.log('✅ Auth test successful. Token is valid.');
        console.log('User found:', authTestResponse.data.userFound);
        console.log('Astrologer found:', authTestResponse.data.astrologerFound);
        
        if (!authTestResponse.data.astrologerFound) {
          console.log('⚠️ No astrologer profile found for this user.');
          console.log('Token payload:', authTestResponse.data.tokenPayload);
          
          if (authTestResponse.data.userData) {
            console.log('User data:', authTestResponse.data.userData);
          }
          
          return {
            success: false,
            message: 'Your user account is valid, but no astrologer profile is associated with it.',
            authData: authTestResponse.data
          };
        }
        
        // If we have a valid astrologer, try to get bookings
        console.log('Astrologer profile:', authTestResponse.data.astrologerData);
        
        // Try the check-bookings-by-mobile endpoint
        const mobileNumber = authTestResponse.data.tokenPayload.mobileNumber || 
                             authTestResponse.data.userData?.mobileNumber || 
                             authTestResponse.data.astrologerData?.mobile;
        
        const userId = authTestResponse.data.tokenPayload.id || 
                       authTestResponse.data.userData?._id || 
                       authTestResponse.data.astrologerData?.userId;
        
        if (!mobileNumber) {
          console.log('No mobile number found in profiles');
          return authTestResponse.data;
        }
        
        console.log(`Checking bookings for mobile: ${mobileNumber} and user ID: ${userId}`);
        
        const bookingsResponse = await axios.post(`${connectedUrl}/debug/check-bookings-by-mobile`, {
          mobileNumber,
          userId
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Bookings check response:', bookingsResponse.data);
        return bookingsResponse.data;
      } else {
        console.log('⚠️ Auth test failed or returned unexpected response');
        return authTestResponse.data;
      }
    } catch (authTestError: any) {
      console.log('Auth test error:', authTestError.message);
      
      // If auth test fails, try the server info endpoint to get diagnostic data
      try {
        const serverInfoResponse = await axios.get(`${connectedUrl}/debug/server-info`);
        console.log('Server info:', serverInfoResponse.data);
        
        return {
          success: false,
          message: 'Authentication failed but server is reachable. Token may be invalid or expired.',
          serverInfo: serverInfoResponse.data,
          error: authTestError.message
        };
      } catch (serverInfoError: any) {
        console.log('Server info error:', serverInfoError.message);
      }
      
      return {
        success: false,
        message: 'Authentication test failed. ' + authTestError.message
      };
    }
  } catch (error: any) {
    console.error('Error in debugDirectBookingFetch:', error);
    return {
      success: false,
      message: 'Debugging process failed: ' + error.message
    };
  }
};

/**
 * Lookup an astrologer by mobile number
 * @param mobileNumber The mobile number to search for
 * @returns Astrologer profile or error message
 */
export const lookupAstrologerByMobile = async (mobileNumber: string): Promise<any> => {
  try {
    console.log(`Looking up astrologer for mobile number: ${mobileNumber}`);
    
    // First test basic API connectivity
    console.log('Testing basic API connectivity...');
    let apiConnected = false;
    let connectedUrl = '';
    
    // Create an array of base URLs to try
    const baseUrls = [
      API_URL, // Try the configured API URL first
      `http://10.0.2.2:${API_PORT}/api`, // Android emulator special IP
      `http://${LOCAL_IP}:${API_PORT}/api`, // Local network IP
      `http://localhost:${API_PORT}/api`, // Standard localhost
      'https://api.jyotish.app/api' // Production API URL
    ];
    
    // Try each URL to find one that works
    for (const baseUrl of baseUrls) {
      try {
        console.log(`Trying to connect to ${baseUrl}/debug/ping...`);
        const pingResponse = await axios.get(`${baseUrl}/debug/ping`, {
          timeout: 5000
        });
        
        if (pingResponse.data && pingResponse.data.success) {
          console.log(`✅ Successfully connected to ${baseUrl}`);
          apiConnected = true;
          connectedUrl = baseUrl;
          break;
        }
      } catch (pingError: any) {
        console.log(`❌ Failed to connect to ${baseUrl}: ${pingError.message}`);
      }
    }
    
    if (!apiConnected) {
      console.log('❌ Could not connect to any API URL');
      return {
        success: false,
        message: 'API connectivity test failed. Unable to connect to any server.'
      };
    }
    
    // Now use the working URL to lookup the astrologer
    try {
      console.log(`Looking up astrologer at ${connectedUrl}/debug/lookup-astrologer/${mobileNumber}`);
      const response = await axios.get(`${connectedUrl}/debug/lookup-astrologer/${mobileNumber}`, {
        timeout: 10000
      });
      
      console.log('Lookup response:', response.data);
      return response.data;
    } catch (lookupError: any) {
      console.error('Lookup failed:', lookupError.message);
      
      // Try a direct login by mobile as a fallback
      try {
        console.log('Trying login by mobile as a fallback...');
        const loginResponse = await axios.post(`${connectedUrl}/debug/login-by-mobile`, {
          mobileNumber
        });
        
        console.log('Login response:', loginResponse.data);
        
        if (loginResponse.data.success && loginResponse.data.astrologer) {
          return {
            success: true,
            message: 'Found via login method',
            astrologer: loginResponse.data.astrologer,
            user: loginResponse.data.user
          };
        }
        
        return {
          success: false,
          message: 'No astrologer profile found',
          userData: loginResponse.data.user
        };
      } catch (loginError: any) {
        console.error('Login fallback failed:', loginError.message);
        return {
          success: false,
          message: 'Lookup failed: ' + lookupError.message
        };
      }
    }
  } catch (error: any) {
    console.error('Error in lookupAstrologerByMobile:', error);
    return {
      success: false,
      message: 'Error looking up astrologer: ' + error.message
    };
  }
};

export default {
  getMyBookingRequests,
  getFilteredBookingRequests,
  acceptBookingRequest,
  declineBookingRequest,
  getAstrologerProfile,
  debugToken,
  debugDirectBookingFetch,
  lookupAstrologerByMobile,
  getBookingRequestsByAstrologerId
}; 