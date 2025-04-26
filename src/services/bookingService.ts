import api from './api';
import { API_ENDPOINTS, API_URL, APP_IDENTIFIER } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Booking {
  _id: string;
  user: string | { _id: string; name: string; };
  astrologer: string;
  consultationType: 'chat' | 'call' | 'video';
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  amount: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingResponse {
  success: boolean;
  data: Booking;
  message: string;
}

export interface BookingListResponse {
  success: boolean;
  data: Booking[];
  message: string;
}

// Mock data for development and fallback
const mockBookings: Booking[] = [
  {
    _id: '1',
    user: { _id: 'u1', name: 'Rahul Sharma' },
    astrologer: 'a1',
    consultationType: 'video',
    status: 'completed',
    amount: 500,
    startTime: '2023-08-15T14:30:00.000Z',
    endTime: '2023-08-15T15:00:00.000Z',
    duration: 30,
    createdAt: '2023-08-10T10:00:00.000Z',
    updatedAt: '2023-08-15T15:00:00.000Z'
  },
  {
    _id: '2',
    user: { _id: 'u2', name: 'Priya Singh' },
    astrologer: 'a1',
    consultationType: 'chat',
    status: 'confirmed',
    amount: 300,
    startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    duration: 30,
    createdAt: '2023-08-12T10:00:00.000Z',
    updatedAt: '2023-08-12T10:00:00.000Z'
  },
  {
    _id: '3',
    user: { _id: 'u3', name: 'Amit Patel' },
    astrologer: 'a1',
    consultationType: 'call',
    status: 'confirmed',
    amount: 400,
    startTime: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
    duration: 15,
    createdAt: '2023-08-13T10:00:00.000Z',
    updatedAt: '2023-08-13T10:00:00.000Z'
  },
  {
    _id: '4',
    user: { _id: 'u4', name: 'Sneha Gupta' },
    astrologer: 'a1',
    consultationType: 'video',
    status: 'completed',
    amount: 600,
    startTime: '2023-08-14T09:15:00.000Z',
    endTime: '2023-08-14T10:00:00.000Z',
    duration: 45,
    createdAt: '2023-08-10T10:00:00.000Z',
    updatedAt: '2023-08-14T10:00:00.000Z'
  },
  {
    _id: '5',
    user: { _id: 'u5', name: 'Vikram Malhotra' },
    astrologer: 'a1',
    consultationType: 'chat',
    status: 'completed',
    amount: 300,
    startTime: '2023-08-12T11:30:00.000Z',
    endTime: '2023-08-12T12:00:00.000Z',
    duration: 30,
    createdAt: '2023-08-10T10:00:00.000Z',
    updatedAt: '2023-08-12T12:00:00.000Z'
  }
];

/**
 * Get a booking by its ID
 * @param bookingId - The ID of the booking to retrieve
 * @returns The booking details
 */
export const getBookingById = async (bookingId: string): Promise<Booking> => {
  try {
    const response = await api.get<BookingResponse>(`/bookings/${bookingId}`);
    
    if (response.data && response.data.success) {
      return response.data.data;
    } else {
      console.error('Unexpected API response structure:', response.data);
      throw new Error(response.data.message || 'Failed to fetch booking');
    }
  } catch (error) {
    console.error(`Error fetching booking with ID ${bookingId}:`, error);
    
    // Return mock data for development
    const mockBooking = mockBookings.find(b => b._id === bookingId);
    if (mockBooking) {
      console.log('Returning mock booking data');
      return mockBooking;
    }
    
    throw error;
  }
};

/**
 * Get all bookings for the logged-in astrologer
 * @returns Array of bookings
 */
export const getMyBookings = async (): Promise<Booking[]> => {
  try {
    console.log('Attempting to fetch bookings for astrologer');
    
    // Use the endpoints from the config
    const endpoints = [...API_ENDPOINTS.BOOKINGS, '/booking-requests/astrologer'];
    
    let lastError = null;
    
    // Try each endpoint in sequence
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying endpoint: ${endpoint}`);
        
        // Log full request details for debugging
        console.log(`Making API request to: ${endpoint}`);
        console.log(`Full request details: ${JSON.stringify({
          baseURL: api.defaults.baseURL,
          method: 'get',
          url: endpoint
        })}`);

        // Safely access the token and log the first few characters
        const authHeader = api.defaults.headers.common['Authorization'];
        console.log(`Token in use: ${typeof authHeader === 'string' ? authHeader.substring(0, 10) + '...' : 'Not available'}`);
        
        const response = await api.get<BookingListResponse>(endpoint);
        
        if (response.data && response.data.success) {
          console.log(`Successful response from endpoint: ${endpoint}`);
          return response.data.data;
        } else {
          console.warn(`Endpoint ${endpoint} returned unsuccessful response:`, response.data);
        }
      } catch (error: any) {
        console.error(`Error with endpoint ${endpoint}:`, error.message);
        lastError = error;
        // Continue to next endpoint
      }
    }
    
    // If we reach here, all endpoints failed
    console.error('All booking endpoints failed:', lastError);
    
    // Try one more approach - get with query params
    try {
      console.log('Trying with query params approach');
      const response = await api.get<BookingListResponse>('/bookings', {
        params: { userType: 'astrologer' }
      });
      
      if (response.data && response.data.success) {
        console.log('Query params approach succeeded');
        return response.data.data;
      }
    } catch (queryError) {
      console.error('Query params approach also failed:', queryError);
    }
    
    // If all real API attempts fail, fall back to mock data in development
    if (__DEV__) {
      console.warn('Falling back to mock consultation data for development');
      // Only return mockBookings with consultation-like statuses
      const mockConsultations = mockBookings.filter(b => 
        b.status === 'completed' || b.status === 'confirmed' || b.status === 'active'
      );
      console.log('All real API attempts failed, using mock data in development or empty array in production');
      return mockConsultations;
    }
    
    // In production, return empty array rather than mock data
    return [];
  } catch (error) {
    console.error('Unexpected error fetching astrologer bookings:', error);
    
    // Only return mock data in development
    if (__DEV__) {
      console.log('Returning mock bookings data due to error (development only)');
      return mockBookings;
    }
    
    // In production, return empty array
    return [];
  }
};

/**
 * Update the status of a booking
 * @param bookingId - The ID of the booking to update
 * @param status - The new status
 * @returns The updated booking
 */
export const updateBookingStatus = async (bookingId: string, status: Booking['status']): Promise<Booking> => {
  try {
    const response = await api.put<BookingResponse>(`/bookings/${bookingId}/status`, { status });
    
    if (response.data && response.data.success) {
      return response.data.data;
    } else {
      console.error('Unexpected API response structure:', response.data);
      throw new Error(response.data.message || 'Failed to update booking status');
    }
  } catch (error) {
    console.error(`Error updating booking status for ID ${bookingId}:`, error);
    throw error;
  }
};

/**
 * Mark a booking as started
 * @param bookingId - The ID of the booking to start
 * @returns The updated booking
 */
export const startBooking = async (bookingId: string): Promise<Booking> => {
  try {
    const response = await api.put<BookingResponse>(`/bookings/${bookingId}/start`);
    
    if (response.data && response.data.success) {
      return response.data.data;
    } else {
      console.error('Unexpected API response structure:', response.data);
      throw new Error(response.data.message || 'Failed to start booking');
    }
  } catch (error) {
    console.error(`Error starting booking ID ${bookingId}:`, error);
    throw error;
  }
};

/**
 * Mark a booking as completed
 * @param bookingId - The ID of the booking to complete
 * @returns The updated booking
 */
export const completeBooking = async (bookingId: string): Promise<Booking> => {
  try {
    const response = await api.put<BookingResponse>(`/bookings/${bookingId}/complete`);
    
    if (response.data && response.data.success) {
      return response.data.data;
    } else {
      console.error('Unexpected API response structure:', response.data);
      throw new Error(response.data.message || 'Failed to complete booking');
    }
  } catch (error) {
    console.error(`Error completing booking ID ${bookingId}:`, error);
    throw error;
  }
};

/**
 * Get all consultations (completed or upcoming bookings) for the logged-in astrologer
 * @returns Array of bookings that represent consultations
 */
export const getConsultations = async (): Promise<Booking[]> => {
  try {
    console.log('Attempting to fetch consultations for astrologer');
    
    // Use the endpoints from the config
    const endpoints = API_ENDPOINTS.CONSULTATIONS;
    
    let lastError = null;
    
    // STEP 1: Try GET requests with each consultation-specific endpoint
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying consultations endpoint: ${endpoint}`);
        const response = await api.get<BookingListResponse>(endpoint);
        
        if (response.data && response.data.success) {
          console.log(`Successful response from consultations endpoint: ${endpoint}`);
          return response.data.data;
        } else {
          console.warn(`Endpoint ${endpoint} returned unsuccessful response:`, response.data);
        }
      } catch (error: any) {
        console.error(`Error with consultations endpoint ${endpoint}:`, error.message);
        lastError = error;
        // Continue to next endpoint
      }
    }
    
    // STEP 2: If all endpoints fail, try a direct axios call bypassing api instance
    try {
      console.log('Trying direct axios call to consultations endpoint');
      const token = await AsyncStorage.getItem('token');
      
      // Import axios directly for this special call
      const axios = require('axios').default;
      
      // Try direct call to most common consultation endpoint patterns
      const directEndpoints = [
        `${API_URL}/consultations/astrologer`,
        `${API_URL}/consultations`,
        `${API_URL}/bookings/consultations`
      ];
      
      for (const endpoint of directEndpoints) {
        try {
          console.log(`Trying direct axios call to: ${endpoint}`);
          const response = await axios.get(endpoint, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-App-Identifier': APP_IDENTIFIER
            },
            timeout: 10000
          });
          
          // Check for valid response structure
          if (response.data && (response.data.success || Array.isArray(response.data.data || response.data))) {
            console.log(`Direct axios call succeeded to: ${endpoint}`);
            // Handle different response formats
            if (Array.isArray(response.data)) {
              return response.data; 
            } else if (Array.isArray(response.data.data)) {
              return response.data.data;
            } else if (response.data.data) {
              return [response.data.data];
            }
          }
        } catch (directError: any) {
          console.error(`Direct axios call failed for ${endpoint}:`, directError.message);
          // Continue to next endpoint
        }
      }
    } catch (axiosError) {
      console.error('All direct axios attempts failed:', axiosError);
    }
    
    // STEP 3: If all direct consultation endpoints fail, try the booking endpoints with filter parameters
    try {
      // Try the booking endpoints directly first
      console.log('Trying to get bookings and use them as consultations');
      try {
        const bookingsResponse = await getMyBookings();
        if (bookingsResponse && bookingsResponse.length > 0) {
          console.log('Successfully fetched bookings to use as consultations');
          // Filter for only consultation-like statuses
          const consultationLikeBookings = bookingsResponse.filter(b => 
            b.status === 'completed' || b.status === 'confirmed' || b.status === 'active'
          );
          return consultationLikeBookings;
        }
      } catch (bookingsError) {
        console.error('Error using bookings as consultations:', bookingsError);
      }
      
      // Try a custom query that might filter bookings to just consultations
      console.log('Trying with booking query params approach');
      const queryParamsApproaches = [
        { params: { type: 'consultation' } },
        { params: { status: ['confirmed', 'completed'].join(',') } },
        { params: { role: 'astrologer' } }
      ];
      
      for (const queryParams of queryParamsApproaches) {
        try {
          console.log('Trying with query params:', JSON.stringify(queryParams));
          const response = await api.get<BookingListResponse>('/bookings', queryParams);
          
          if (response.data && response.data.success) {
            console.log('Query params approach succeeded');
            return response.data.data;
          }
        } catch (queryError) {
          console.error('Query params approach failed:', queryError);
          // Continue to next query approach
        }
      }
    } catch (allQueriesError) {
      console.error('All query parameter approaches failed:', allQueriesError);
    }
    
    // STEP 4: As a last resort, try the mock data
    console.log('All real API attempts failed, using mock data in development or empty array in production');
    
    // In development, use mock data
    if (__DEV__) {
      console.warn('Falling back to mock consultation data for development');
      // Only return mockBookings with consultation-like statuses
      const mockConsultations = mockBookings.filter(b => 
        b.status === 'completed' || b.status === 'confirmed' || b.status === 'active'
      );
      return mockConsultations;
    }
    
    // In production, return empty array
    return [];
  } catch (error) {
    console.error('Unexpected error fetching astrologer consultations:', error);
    
    // Only return mock data in development
    if (__DEV__) {
      console.log('Returning mock consultation data due to error (development only)');
      return mockBookings;
    }
    
    // In production, return empty array
    return [];
  }
}; 