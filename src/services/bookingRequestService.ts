import api from './api';

export interface BookingRequest {
  _id: string;
  userId: {
    _id: string;
    name: string;
    mobileNumber: string;
  };
  astrologerId: string;
  consultationType: 'chat' | 'call' | 'video';
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed';
  amount: number;
  notes?: string;
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

export const bookingRequestService = {
  // Get all booking requests for the logged-in astrologer
  getMyBookingRequests: async () => {
    try {
      const response = await api.get<BookingRequestListResponse>('/booking-requests/astrologer');
      
      if (response.data && response.data.success) {
        return response.data.data;
      } else {
        console.error('Unexpected API response structure:', response.data);
        return [];
      }
    } catch (error) {
      console.error('Error fetching astrologer booking requests:', error);
      throw error;
    }
  },

  // Accept a booking request
  acceptBookingRequest: async (id: string) => {
    try {
      const response = await api.put<BookingRequestResponse>(`/booking-requests/${id}/accept`);
      
      if (response.data && response.data.success) {
        return response.data.data;
      } else {
        console.error('Unexpected API response structure:', response.data);
        throw new Error(response.data.message || 'Failed to accept booking request');
      }
    } catch (error) {
      console.error(`Error accepting booking request with ID ${id}:`, error);
      throw error;
    }
  },

  // Reject a booking request
  rejectBookingRequest: async (id: string, reason?: string) => {
    try {
      const response = await api.put<BookingRequestResponse>(`/booking-requests/${id}/reject`, { reason });
      
      if (response.data && response.data.success) {
        return response.data.data;
      } else {
        console.error('Unexpected API response structure:', response.data);
        throw new Error(response.data.message || 'Failed to reject booking request');
      }
    } catch (error) {
      console.error(`Error rejecting booking request with ID ${id}:`, error);
      throw error;
    }
  },

  // Get booking request by ID
  getBookingRequestById: async (id: string) => {
    try {
      const response = await api.get<BookingRequestResponse>(`/booking-requests/${id}`);
      
      if (response.data && response.data.success) {
        return response.data.data;
      } else {
        console.error('Unexpected API response structure:', response.data);
        throw new Error(response.data.message || 'Failed to fetch booking request');
      }
    } catch (error) {
      console.error(`Error fetching booking request with ID ${id}:`, error);
      throw error;
    }
  }
};

export default bookingRequestService; 