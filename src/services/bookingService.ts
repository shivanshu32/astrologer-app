import api from './api';

export interface Booking {
  _id: string;
  user: string;
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
    throw error;
  }
};

/**
 * Get all bookings for the logged-in astrologer
 * @returns Array of bookings
 */
export const getMyBookings = async (): Promise<Booking[]> => {
  try {
    const response = await api.get<BookingListResponse>('/bookings/astrologer');
    
    if (response.data && response.data.success) {
      return response.data.data;
    } else {
      console.error('Unexpected API response structure:', response.data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching astrologer bookings:', error);
    throw error;
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