import api from './api';

export interface User {
  _id: string;
  name: string;
  email?: string;
  mobileNumber: string;
  profilePicture?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UserResponse {
  success: boolean;
  data: User;
  message: string;
}

/**
 * Get user details by ID
 * @param userId - The ID of the user to retrieve
 * @returns The user details
 */
export const getUserById = async (userId: string): Promise<User> => {
  try {
    const response = await api.get<UserResponse>(`/users/${userId}`);
    
    if (response.data && response.data.success) {
      return response.data.data;
    } else {
      console.error('Unexpected API response structure:', response.data);
      throw new Error(response.data.message || 'Failed to fetch user');
    }
  } catch (error) {
    console.error(`Error fetching user with ID ${userId}:`, error);
    throw error;
  }
};

/**
 * Get all users for an astrologer
 * This would typically be used to list users that have consulted with the astrologer
 * @returns Array of users
 */
export const getMyUsers = async (): Promise<User[]> => {
  try {
    const response = await api.get<{success: boolean, data: User[], message: string}>('/users/my-clients');
    
    if (response.data && response.data.success) {
      return response.data.data;
    } else {
      console.error('Unexpected API response structure:', response.data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching astrologer users:', error);
    throw error;
  }
}; 