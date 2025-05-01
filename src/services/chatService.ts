import axios from 'axios';
import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAstrologerProfile } from './bookingRequestService';
import { Platform } from 'react-native';
import apiInstance from './api';
import * as socketService from './socketService';

// Constants
const APP_IDENTIFIER = 'astrologer-app';

// Types
interface ChatMessage {
  _id: string;
  sender: string;
  senderType: 'user' | 'astrologer';
  message: string;
  timestamp: Date;
  read: boolean;
  attachments?: Array<{
    type: string;
    url: string;
    mimetype: string;
  }>;
}

interface Chat {
  _id: string;
  booking: {
    _id: string;
    consultationType: string;
    amount: number;
    status: string;
    createdAt: Date;
  };
  user: {
    _id: string;
    name: string;
    mobileNumber: string;
  };
  astrologer: string;
  messages: ChatMessage[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ApiResponse<T> {
  data: T;
  status: number;
}

// Additional types for clarity and type safety
type ChatId = string;
type BookingId = string;
type AstrologerId = string;
type UserId = string;

interface CacheEntry {
  chatId: string;
  timestamp: number;
  permissionDenied?: boolean;
  notFound?: boolean;
}

// Get auth token from AsyncStorage
const getAuthToken = async () => {
  const token = await AsyncStorage.getItem('token');
  if (!token) {
    console.warn('No auth token found in AsyncStorage');
  }
  return token;
};

// Set up axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(async (config) => {
  const token = await getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Helper function to validate MongoDB IDs
const isValidMongoId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

// Helper function to extract the correct astrologer ID
const getValidAstrologerId = async (): Promise<string | null> => {
  try {
    // Store all potential IDs for debugging
    const potentialIds: {source: string, id: string}[] = [];
    
    // Try to get from profile in API first
    const profile = await getAstrologerProfile();
    if (profile && profile._id && isValidMongoId(profile._id)) {
      console.log(`Got valid astrologer ID from profile: ${profile._id}`);
      potentialIds.push({source: 'profile', id: profile._id});
      
      // If we get a valid profile ID, store it to ensure consistency
      await AsyncStorage.setItem('astrologerId', profile._id);
      
      // Store in userData as well for socket service
      try {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          userData.astrologerId = profile._id;
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
          console.log(`Updated astrologerId in userData: ${profile._id}`);
        }
      } catch (userDataError) {
        console.error('Error updating userData with astrologerId:', userDataError);
      }
      
      return profile._id;
    }

    // Try from AsyncStorage
    const directId = await AsyncStorage.getItem('astrologerId');
    if (directId && isValidMongoId(directId)) {
      console.log(`Got valid astrologer ID from AsyncStorage: ${directId}`);
      potentialIds.push({source: 'asyncStorage', id: directId});
      return directId;
    }

    // Try from userData
    const userDataStr = await AsyncStorage.getItem('userData');
    if (userDataStr) {
      const userData = JSON.parse(userDataStr);
      if (userData && userData._id && isValidMongoId(userData._id)) {
        console.log(`Got valid astrologer ID from userData._id: ${userData._id}`);
        potentialIds.push({source: 'userData._id', id: userData._id});
        
        // Store this ID in astrologerId for future consistency
        await AsyncStorage.setItem('astrologerId', userData._id);
        return userData._id;
      }
      
      if (userData && userData.astrologerId && isValidMongoId(userData.astrologerId)) {
        console.log(`Got valid astrologer ID from userData.astrologerId: ${userData.astrologerId}`);
        potentialIds.push({source: 'userData.astrologerId', id: userData.astrologerId});
        return userData.astrologerId;
      }
      
      if (userData && userData.id && isValidMongoId(userData.id)) {
        console.log(`Got valid astrologer ID from userData.id: ${userData.id}`);
        potentialIds.push({source: 'userData.id', id: userData.id});
        
        // Store this ID in astrologerId for future consistency
        await AsyncStorage.setItem('astrologerId', userData.id);
        // Also update userData.astrologerId for consistency
        userData.astrologerId = userData.id;
        await AsyncStorage.setItem('userData', JSON.stringify(userData));
        
        return userData.id;
      }
    }

    // Try from decoded token as last resort
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        // Basic JWT decoding
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload && payload._id && isValidMongoId(payload._id)) {
            console.log(`Got valid astrologer ID from token._id: ${payload._id}`);
            potentialIds.push({source: 'token._id', id: payload._id});
            
            // Store for future use
            await AsyncStorage.setItem('astrologerId', payload._id);
            return payload._id;
          }
          
          if (payload && payload.id && isValidMongoId(payload.id)) {
            console.log(`Got valid astrologer ID from token.id: ${payload.id}`);
            potentialIds.push({source: 'token.id', id: payload.id});
            
            // Store for future use
            await AsyncStorage.setItem('astrologerId', payload.id);
            return payload.id;
          }
        }
      }
    } catch (tokenError) {
      console.error('Error extracting ID from token:', tokenError);
    }

    // Log all potential IDs for debugging
    if (potentialIds.length > 0) {
      console.warn('Found potential astrologer IDs but none were used:', 
        JSON.stringify(potentialIds, null, 2));
    }

    console.error('Could not find a valid astrologer ID');
    return null;
  } catch (err) {
    console.error('Error getting valid astrologer ID:', err);
    return null;
  }
};

// Add a simple cache for chat existence to prevent repeated creation attempts
// Track permission errors to avoid repeated permission checks
const chatExistenceCache = new Map<BookingId, CacheEntry>();

// Helper function to check the cache before making API calls
const getCachedChatId = (bookingId: BookingId): ChatId | null => {
  if (!bookingId) return null;

  const cached = chatExistenceCache.get(bookingId);
  if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
    if (cached.permissionDenied) {
      console.log(`Skipping cached chat ID ${cached.chatId} for booking ${bookingId} due to previous permission error`);
      return null;
    }
    if (cached.notFound) {
      console.log(`Cached chat ID ${cached.chatId} for booking ${bookingId} was previously not found, will create new`);
      return null;
    }
    console.log(`Using cached chat ID ${cached.chatId} for booking ${bookingId}`);
    return cached.chatId;
  }
  return null;
};

// Helper function to store chat ID in cache
const setCachedChatId = (
  bookingId: BookingId, 
  chatId: ChatId, 
  options?: { 
    permissionDenied?: boolean; 
    notFound?: boolean 
  }
): void => {
  if (!bookingId || !chatId) return;

  chatExistenceCache.set(bookingId, { 
    chatId, 
    timestamp: Date.now(),
    permissionDenied: options?.permissionDenied,
    notFound: options?.notFound 
  });
  console.log(`Cached chat ID ${chatId} for booking ${bookingId}${options?.permissionDenied ? ' (permission denied)' : ''}${options?.notFound ? ' (not found)' : ''}`);
};

// Store reverse lookup for chats to bookings
const chatToBookingMap = new Map<ChatId, BookingId>();

// Helper function to find a booking ID for a specific chat ID
const findBookingIdForChat = async (chatId: ChatId): Promise<BookingId | null> => {
  if (!chatId) return null;

  // First check our local map
  if (chatToBookingMap.has(chatId)) {
    return chatToBookingMap.get(chatId) || null;
  }
  
  // Otherwise, check the cache entries
  for (const [bookingId, entry] of chatExistenceCache.entries()) {
    if (entry.chatId === chatId) {
      // Store in direct lookup map for future use
      chatToBookingMap.set(chatId, bookingId);
      return bookingId;
    }
  }
  
  return null;
};

// Update the cache when we create a new chat or associate a chat with a booking
const associateChatWithBooking = (chatId: ChatId, bookingId: BookingId): void => {
  if (!chatId || !bookingId) return;
  chatToBookingMap.set(chatId, bookingId);
};

export const chatService = {
  // Get all chats for the authenticated astrologer
  getAstrologerChats: async (): Promise<Chat[]> => {
    try {
      // Get astrologer profile to get ID
      const profile = await getAstrologerProfile();
      console.log('Retrieved astrologer profile:', {
        hasProfile: !!profile,
        profileId: profile?._id
      });

      if (!profile || !profile._id) {
        throw new Error('Could not get astrologer profile');
      }

      const astrologerId = profile._id;
      
      // Get auth token for headers
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        throw new Error('No auth token found');
      }
      
      // Use the standardized headers for astrologer app
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER,
        'X-Astrologer-ID': astrologerId
      };
      
      // Try these endpoints in order - according to the API documentation
      const endpoints = [
        '/chats/astrologer',          // Primary recommended endpoint
        '/chat/astrologer',           // Alternative endpoint
        '/api/chats/astrologer',      // For systems that might not have URL normalization
        '/chats?type=astrologer',     // Query parameter approach
        '/bookings/chats'            // Fallback endpoint
      ];
      
      let lastError = null;
      
      // Try each endpoint until one works
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying to retrieve astrologer chats from endpoint: ${endpoint}`);
          const response = await api.get(endpoint, { headers });
          
          if (response.data && response.data.success && Array.isArray(response.data.data)) {
            console.log(`✅ Successfully retrieved ${response.data.data.length} chats from endpoint: ${endpoint}`);
            return response.data.data;
          } 
          
          // Check for empty array response - this is still valid
          if (response.data && response.data.success && response.data.data === null) {
            console.log(`✅ Retrieved 0 chats from endpoint: ${endpoint} (no chats found)`);
            return [];
          }
          
          console.log(`⚠️ Invalid response format from ${endpoint}:`, response.data);
        } catch (error: any) {
          console.log(`❌ Endpoint ${endpoint} failed with status ${error.response?.status || 'unknown'}`);
          lastError = error;
          // Continue to next endpoint
        }
      }
      
      // If we get here, all endpoints failed
      console.error('❌ All endpoint attempts failed for astrologer chats. Last error:', {
        status: lastError?.response?.status,
        message: lastError?.message,
        data: lastError?.response?.data
      });
      
      // Return empty array instead of throwing to prevent UI errors
      return [];
    } catch (error: any) {
      console.error('Error getting astrologer chats:', {
        error,
        errorName: error.name,
        errorMessage: error.message
      });
      // Return empty array instead of throwing to prevent UI errors
      return [];
    }
  },

  // Get messages for a specific chat
  getChatMessages: async (chatId: string, bookingId?: string): Promise<ChatMessage[]> => {
    if (!chatId && !bookingId) {
      console.error('ERROR: Either chatId or bookingId must be provided');
      throw new Error('Either chatId or bookingId must be provided');
    }
    
    console.log(`Fetching messages with chatId: ${chatId}${bookingId ? `, bookingId: ${bookingId}` : ''}`);
    
    try {
      // Check if we have a valid token
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      console.log('Debug: Token available. Length:', token.length);
      
      // Get the astrologer ID
      const astrologerId = await getValidAstrologerId();
      if (!astrologerId) {
        console.warn('Warning: Could not determine astrologer ID for message fetch');
      }
      
      // Set up standard headers
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER
      };
      
      if (astrologerId) {
        headers['X-Astrologer-ID'] = astrologerId;
      }
      
      // First try with axios using our configured instance and proper endpoint
      try {
        // Ensure we have either a valid chatId or bookingId - defensively check again
        const useChatId = chatId || '';
        const useBookingId = bookingId || '';
        
        // Construct the endpoint based on available IDs - prioritize bookingId
        let endpoint = '';
        if (useBookingId) {
          endpoint = `/chats/booking/${useBookingId}`;
        } else if (useChatId) {
          endpoint = `/chats/${useChatId}`;
        } else {
          throw new Error('Either chatId or bookingId must be provided');
        }
          
        console.log(`Attempting to fetch messages from: ${endpoint}`);
        const response = await api.get(endpoint, { headers });
        
        if (response.data && response.data.success && response.data.data) {
          console.log('Successfully fetched chat data');
          
          // Handle different response formats
          if (Array.isArray(response.data.data)) {
            console.log(`Found ${response.data.data.length} messages`);
            return response.data.data;
          } else if (response.data.data.messages && Array.isArray(response.data.data.messages)) {
            console.log(`Found ${response.data.data.messages.length} messages in chat object`);
            return response.data.data.messages;
          } else {
            console.log('Chat data found but no messages array');
            return []; // Return empty array if no messages found
          }
        } else {
          console.log('Invalid response format, no success or data field');
          return []; // Return empty array for invalid response
        }
      } catch (axiosError: any) {
        console.error('Error fetching messages with axios:', axiosError.message);
        console.log('Status:', axiosError.response?.status);
        console.log('Response:', axiosError.response?.data);
        
        // For 404 errors, this is expected for new chats
        if (axiosError.response?.status === 404) {
          console.log('Chat not found (404) - this is normal for new bookings');
          return [];
        }
        
        throw axiosError; // Rethrow for other errors
      }
    } catch (error: any) {
      console.error('Error fetching chat messages:', error.message);
      // Return empty array instead of throwing to avoid UI errors
      return [];
    }
  },

  // Helper function to validate if a chatroom exists
  validateChatroom: async (
    chatId?: string,
    bookingId?: string
  ): Promise<{exists: boolean, validChatId?: string, error?: string}> => {
    try {
      console.log(`Validating chatroom: chatId=${chatId}, bookingId=${bookingId}`);
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        return { exists: false, error: 'No auth token found' };
      }
      
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER
      };
      
      // Get the base URL
      const baseUrl = API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
      
      // Define endpoints to check based on provided IDs
      const endpoints = [];
      
      if (bookingId) {
        endpoints.push(
          `${baseUrl}/api/chat/booking/${bookingId}`,
          `${baseUrl}/api/chats/booking/${bookingId}`,
          `${baseUrl}/api/bookings/${bookingId}/chat`
        );
      }
      
      if (chatId) {
        endpoints.push(
          `${baseUrl}/api/chat/chatrooms/${chatId}`,
          `${baseUrl}/api/chat/${chatId}`,
          `${baseUrl}/api/chats/${chatId}`
        );
      }
      
      // Try each endpoint
      for (const endpoint of endpoints) {
        try {
          console.log(`Checking if chatroom exists at: ${endpoint}`);
          const response = await axios.get(endpoint, { headers });
          
          if (response.status >= 200 && response.status < 300) {
            console.log(`Chatroom exists!`, response.data);
            
            // Extract the chat ID from response
            let validChatId = chatId;
            if (response.data) {
              if (response.data.data && response.data.data._id) {
                validChatId = response.data.data._id;
              } else if (response.data._id) {
                validChatId = response.data._id;
              }
            }
            
            return { 
              exists: true, 
              validChatId
            };
          }
        } catch (error: any) {
          console.log(`Endpoint ${endpoint} check failed:`, error.message);
          // Continue to next endpoint
        }
      }
      
      // If we didn't find an existing chat but have a bookingId,
      // try to create a new chat
      if (bookingId && !chatId) {
        try {
          console.log(`No existing chat found. Creating new chat for booking ${bookingId}`);
          const newChat = await chatService.createChatForBooking(bookingId, '');
          
          if (newChat && newChat._id) {
            console.log(`Created new chat with ID: ${newChat._id}`);
            return {
              exists: true,
              validChatId: newChat._id
            };
          }
        } catch (createError: any) {
          console.error(`Failed to create new chat:`, createError.message);
        }
      }
      
      return { exists: false, error: 'No existing chatroom found for the provided IDs' };
    } catch (error: any) {
      console.error('Error validating chatroom:', error.message);
      return { exists: false, error: error.message };
    }
  },

  // Send a message in a chat
  sendMessage: async (
    chatId: string,
    message: string,
    messageType = 'text',
    bookingId?: string
  ): Promise<ApiResponse<ChatMessage>> => {
    if (!chatId && !bookingId) {
      throw new Error('Either chatId or bookingId must be provided');
    }
    
    if (!message || message.trim() === '') {
      throw new Error('Message content cannot be empty');
    }
    
    try {
      // First, try to find associated booking ID if not provided
      let bookingIdToUse = bookingId || '';
      if (!bookingIdToUse) {
        const associatedBookingId = await findBookingIdForChat(chatId);
        if (associatedBookingId) {
          console.log(`Found associated booking ID ${associatedBookingId} for chat ${chatId}`);
          bookingIdToUse = associatedBookingId;
        } else {
          console.error('ERROR: No booking ID associated with this chat and none provided');
          throw new Error('Booking ID is required for sending messages');
        }
      }
      
      // Ensure bookingIdToUse is not empty after all attempts
      if (!bookingIdToUse) {
        throw new Error('Could not determine booking ID for message');
      }
      
      console.log(`Sending message to chat via booking ID: ${bookingIdToUse}`);
      
      // Get the astrologer ID for the request
      const astrologerId = await getValidAstrologerId();
      if (!astrologerId) {
        console.error('ERROR: Could not determine astrologer ID - this is required for sending messages');
        throw new Error('Failed to determine astrologer ID');
      } else {
        console.log(`Sending as astrologer: ${astrologerId}`);
      }
      
      // Create a payload with the message and sender info
      const messagePayload = {
          message,
          messageType,
          senderType: 'astrologer',
        astrologerId: astrologerId
      };
      
      // Get auth token for headers
                const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.error('ERROR: No auth token found - authentication required');
        throw new Error('Authentication token is missing');
      }

      // Set up standard headers for all requests - always include all three headers
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER,
        'X-Astrologer-ID': astrologerId
      };
      
      // Only use the recommended endpoint format
      try {
        // Use only the documented endpoint format with booking ID
        const endpoint = `/chats/booking/${bookingIdToUse}/messages`;
        console.log(`Sending message via endpoint: ${endpoint}`);
        
        const response = await api.post(endpoint, messagePayload, { headers });
        console.log(`✅ Message sent successfully`);
        
        return { 
          data: response.data.data || response.data, 
          status: response.status 
        };
      } catch (error: any) {
        console.error(`❌ Error sending message:`, error.message);
        
        if (error.response) {
          console.log(`Response status: ${error.response.status}`);
          console.log(`Response data:`, error.response.data);
          
          // Handle specific error codes
          if (error.response.status === 403) {
            console.error(`AUTHORIZATION ERROR: Token does not match the booking's astrologer ID`);
            console.error(`Check that this astrologer (${astrologerId}) is assigned to booking ${bookingIdToUse}`);
          } else if (error.response.status === 404) {
            console.error(`CHAT/BOOKING NOT FOUND: Booking ID ${bookingIdToUse} does not exist or chat not created`);
            console.log('Attempting to create chat first...');
            
            // Try to create the chat
            try {
              // Use direct reference to chatService.createChat instead of this
              await chatService.createChat(bookingIdToUse);
              console.log('Chat created successfully, retrying message send...');
              
              // Retry sending the message
              const retryResponse = await api.post(`/chats/booking/${bookingIdToUse}/messages`, messagePayload, { headers });
              console.log(`✅ Message sent successfully after creating chat`);
              
              return { 
                data: retryResponse.data.data || retryResponse.data, 
                status: retryResponse.status 
              };
            } catch (createError) {
              console.error('Failed to create chat:', createError);
              throw new Error(`Failed to send message: Chat creation failed`);
            }
          }
        }
        
        throw new Error(`Failed to send message: ${error.message}`);
      }
    } catch (error: any) {
      console.error(`Error in sendMessage:`, error);
      throw error;
    }
  },

  // Mark messages as read
  markMessagesAsRead: async (chatId: string, bookingId?: string): Promise<any> => {
    try {
      // If we have a bookingId, prefer that over chatId to match our other API patterns
      if (bookingId) {
        console.log(`Marking messages as read in chat for booking ${bookingId}`);
        
        // Construct headers
        const astrologerId = await getValidAstrologerId();
        if (!astrologerId) {
          console.warn('Could not determine astrologer ID for marking messages as read');
        }
        
        const token = await AsyncStorage.getItem('token');
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-Identifier': APP_IDENTIFIER
        };
        
        if (astrologerId) {
          headers['X-Astrologer-ID'] = astrologerId;
        }
        
        try {
          // Use booking ID endpoint first
          const response = await api.put(`/chats/booking/${bookingId}/read`, {}, { headers });
          console.log(`Successfully marked messages as read for booking ${bookingId}`);
          return response.data.data;
            } catch (error: any) {
          console.log(`Booking ID endpoint failed with status ${error.response?.status}, trying chat ID...`);
          // Fall through to chatId approach
        }
      }
      
      // If no bookingId or bookingId approach failed, try with chatId
      console.log(`Marking messages as read in chat ${chatId}`);
      
      try {
      const response = await api.put(`/chats/${chatId}/read`);
        console.log(`Successfully marked messages as read for chat ${chatId}`);
      return response.data.data;
    } catch (error: any) {
        if (error.response?.status === 404) {
          console.log('Chat not found when marking messages as read. This is normal for new chats.');
          return { success: false, error: 'Chat not found' };
        }
      
      // Try alternative endpoints if the standard one fails
      try {
        const altResponse = await api.post(`/chats/${chatId}/messages/read`);
          console.log(`Successfully marked messages as read using alternative endpoint`);
        return altResponse.data.data;
      } catch (altError: any) {
          if (altError.response?.status === 404) {
            console.log('Alternative endpoint also returned not found. Preventing further attempts.');
            return { success: false, error: 'Chat not found' };
          }
        console.error('Alternative endpoint also failed:', altError.message);
        throw error; // Throw the original error
      }
      }
    } catch (error: any) {
      console.error('Error marking messages as read:', error.message);
      
      // Return a structured error response instead of throwing
      // This prevents cascading failures that could lead to infinite loops
      return { 
        success: false, 
        error: error.message 
      };
    }
  },

  // Get unread message count
  getUnreadMessageCount: async () => {
    try {
      const chats = await chatService.getAstrologerChats();
      let unreadCount = 0;
      
      chats.forEach((chat: Chat) => {
        chat.messages.forEach(message => {
          if (message.senderType === 'user' && !message.read) {
            unreadCount++;
          }
        });
      });
      
      return unreadCount;
    } catch (error) {
      console.error('Error getting unread message count:', error);
      return 0;
    }
  },

  // Get chat by booking ID
  getChatByBookingId: async (bookingId: string): Promise<any> => {
    if (!bookingId) {
      throw new Error('Booking ID is required');
    }
    
    try {
      console.log(`Getting chat for booking ${bookingId}`);
      
      // Get the astrologer ID
      const astrologerId = await getValidAstrologerId();
      if (!astrologerId) {
        throw new Error('Could not determine astrologer ID');
      }
      
      // Construct headers - always include all three required headers
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing');
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER,
        'X-Astrologer-ID': astrologerId
      };
      
      // Try getting chat by booking ID directly - use only the documented endpoint
      try {
        const response = await api.get(`/chats/booking/${bookingId}`, { headers });
        console.log(`Found chat for booking ${bookingId}: ${response.data?.data?._id || 'No ID'}`);
        
        // Store in cache if we have a valid chat ID
        if (response.data?.data?._id) {
          const chatId = response.data.data._id;
          setCachedChatId(bookingId, chatId);
          associateChatWithBooking(chatId, bookingId);
        }
        
        return response.data.data;
        } catch (error: any) {
        if (error.response?.status === 403) {
          console.error(`Permission denied (403) accessing chat for booking ${bookingId}. This is likely a permissions issue.`);
          console.error('Verify your JWT token matches the booking\'s astrologer ID');
          throw error;
        }
        
        if (error.response?.status === 404) {
          console.log(`No chat exists yet for booking ${bookingId}. Need to create one.`);
          return null; // Allow falling through to chat creation code
        }
        
        throw error;
      }
    } catch (error) {
      console.error(`Error getting chat by booking ID: ${error}`);
      throw error;
    }
  },

  // Get booking details
  getBookingDetails: async (bookingId: string) => {
    try {
      console.log(`Fetching booking details for ${bookingId}...`);
      
      const token = await AsyncStorage.getItem('token');
      const astrologerId = await AsyncStorage.getItem('astrologerId');
      
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER,
        'User-Agent': 'astrologer-app-mobile',
        'X-App-Platform': Platform.OS,
        'X-Astrologer-Id': astrologerId || ''
      };

      // Try multiple booking endpoints with different formats
      const bookingEndpoints = [
        `/booking-requests/${bookingId}`,
        `/bookings/${bookingId}`,
        `/booking/${bookingId}`,
        `/chat/booking/${bookingId}`,
        `/chats/booking/${bookingId}`
      ];
      
      let lastError = null;
      
      // Try each endpoint
      for (const endpoint of bookingEndpoints) {
        try {
          console.log(`Trying to fetch booking details from ${endpoint}...`);
          const response = await api.get(endpoint, { headers });
          
          if (response.data) {
            // Handle different response formats
            const bookingData = response.data.data || response.data;
            
            // Extract user ID from different possible locations
            const userId = bookingData.userId?._id || 
                          bookingData.userId || 
                          bookingData.user?._id || 
                          bookingData.user ||
                          bookingData.userDetails?._id ||
                          bookingData.userDetails;
            
            if (userId) {
              console.log(`Found user ID in booking data: ${userId}`);
              bookingData.userId = userId; // Ensure userId is set in a consistent location
            }
            
            console.log(`Successfully fetched booking details from ${endpoint}`);
            return bookingData;
          }
        } catch (error: any) {
          console.error(`Error fetching booking from ${endpoint}:`, error.message);
          if (error.response) {
            console.log(`Response status: ${error.response.status}`);
            console.log(`Response data:`, error.response.data);
          }
          lastError = error;
        }
      }
      
      throw lastError || new Error('Failed to fetch booking details from all endpoints');
    } catch (error: any) {
      console.error('Error fetching booking details:', error);
      throw error;
    }
  },

  // Create a new chat for a booking
  createChatForBooking: async (
    bookingId: string,
    receiverId: string
  ): Promise<any> => {
    try {
      console.log(`Creating new chat for booking ${bookingId}`);
      
      // Check if we already have a cached chat ID for this booking
      const cachedChatId = getCachedChatId(bookingId);
      if (cachedChatId) {
        try {
          // Try to use the cached chat ID first
          const existingChat = await chatService.getChatById(cachedChatId);
          console.log(`Using existing chat ${cachedChatId} for booking ${bookingId}`);
          associateChatWithBooking(cachedChatId, bookingId); 
          return existingChat;
        } catch (err) {
          console.log(`Cached chat ID ${cachedChatId} is no longer valid, will create new chat`);
          // Continue with chat creation
        }
      }
      
      // Get the astrologer ID from AsyncStorage or other methods
      const astrologerId = await getValidAstrologerId();
      
      if (!astrologerId) {
        throw new Error('Could not determine astrologer ID');
      }
      
      console.log(`Creating chat with:
        - bookingId: ${bookingId}
        - astrologerId: ${astrologerId}`);
      
      // IMPORTANT: For chat creation, we need to explicitly include the astrologerId 
      // in the payload to ensure the backend uses the correct ID
      const payload = {
        message: 'Hello, I am ready to start your consultation.',
        senderType: 'astrologer',
        astrologerId: astrologerId,
        senderId: astrologerId
      };
      
      console.log('Using simplified payload for chat creation:', payload);
      
      // Create a new chat for this booking by sending a message with explicit headers
      const headers = {
        'X-App-Identifier': 'astrologer-app',
        'X-Astrologer-ID': astrologerId,
        'X-Sender-ID': astrologerId,
        'X-User-ID': astrologerId
      };
      
      // Create a new chat for this booking by sending a message
      const response = await api.post(`/chats/booking/${bookingId}/messages`, payload, { headers });
      
      console.log('Chat creation response:', response.data);
      
      // If we successfully created a chat, cache the chat ID
      if (response.data?.data?.chatId) {
        const newChatId = response.data.data.chatId;
        setCachedChatId(bookingId, newChatId);
        associateChatWithBooking(newChatId, bookingId);
        
        // Try to verify we can access this chat immediately (permission check)
        try {
          console.log('Verifying access to newly created chat...');
          const chatData = await chatService.getChatById(newChatId);
          console.log('Chat creation result:', chatData);
          console.log(`Chat created successfully with chatId: ${newChatId}`);
        } catch (verifyError: any) {
          if (verifyError.message.includes('Permission denied')) {
            console.log('WARNING: Created chat but permission denied when accessing it');
            setCachedChatId(bookingId, newChatId, { permissionDenied: true });
          } else if (verifyError.message.includes('not found')) {
            console.log('WARNING: Created chat but it appears to not exist when queried directly');
            setCachedChatId(bookingId, newChatId, { notFound: true });
          }
        }
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('Error creating chat for booking:', error.message);
      if (axios.isAxiosError(error)) {
        const axiosError = error as any;
        console.error('Error creating chat [DETAILED]:', {
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          url: axiosError.config?.url,
          method: axiosError.config?.method,
          data: axiosError.response?.data,
          headers: axiosError.config?.headers
        });
        
        // Check for specific errors
        if (axiosError.response?.status === 403) {
          console.error('This is likely an authorization error. The token ID may not match the booking\'s astrologer ID.');
        }
      }
      throw error;
    }
  },

  // Create a chat for a booking
  createChat: async (bookingId: string): Promise<any> => {
    if (!bookingId) {
      console.error('ERROR: BookingId is required to create a chat');
      throw new Error('BookingId is required to create a chat');
    }

    try {
      console.log(`Creating chat for booking ${bookingId}`);
      
      // Get the astrologer ID
      const astrologerId = await getValidAstrologerId();
      if (!astrologerId) {
        throw new Error('Could not determine astrologer ID');
      }
      
      // Construct headers
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing');
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER,
        'X-Astrologer-ID': astrologerId
      };
      
      // Use the documented endpoint to create a chat
      const response = await api.post('/chats', { bookingId }, { headers });
      
      if (response.data?.success && response.data?.data?._id) {
        const chatId = response.data.data._id;
        console.log(`Created chat ${chatId} for booking ${bookingId}`);
        
        // Store in cache
        setCachedChatId(bookingId, chatId);
        associateChatWithBooking(chatId, bookingId);
        
        return response.data.data;
      } else {
        console.error('Invalid response format for chat creation:', response.data);
        throw new Error('Failed to create chat: Invalid response');
      }
    } catch (error: any) {
      console.error(`Error creating chat for booking ${bookingId}:`, error);
      
      if (error.response?.status === 409) {
        console.log('Chat already exists, retrieving existing chat...');
        try {
          // Ensure bookingId is still valid
          if (!bookingId) {
            throw new Error('Booking ID is required');
          }
          
          // Use direct reference to chatService.getChatByBookingId instead of this
          const existingChat = await chatService.getChatByBookingId(bookingId);
          return existingChat;
        } catch (retrieveError) {
          console.error('Error retrieving existing chat:', retrieveError);
          throw new Error(`Chat exists but could not be retrieved: ${error.message}`);
        }
      }
      
      throw error;
    }
  },

  // Test function for debugging chat creation and messaging
  testChatCreation: async (bookingId: string): Promise<{
    success: boolean;
    message: string;
    data?: any;
    error?: any;
  }> => {
    try {
      console.log('=== TESTING CHAT CREATION ===');
      console.log(`Testing with bookingId: ${bookingId}`);
      
      // Step 1: Get astrologer ID
      console.log('\n[Step 1] Getting astrologer ID...');
      const astrologerId = await getValidAstrologerId();
      
      if (!astrologerId) {
        return {
          success: false,
          message: 'Could not determine astrologer ID'
        };
      }
      
      console.log(`Astrologer ID: ${astrologerId}`);
      
      // Step 2: Check if chat already exists
      console.log('\n[Step 2] Checking if chat already exists...');
      try {
        const existingChat = await chatService.validateChatroom(undefined, bookingId);
        
        if (existingChat.exists && existingChat.validChatId) {
          console.log(`Chat already exists with ID: ${existingChat.validChatId}`);
          
          // Step 3a: Send a test message to existing chat
          console.log('\n[Step 3a] Sending test message to existing chat...');
          try {
            const messageResponse = await chatService.sendMessage(
              existingChat.validChatId,
              'This is a test message to existing chat',
              'text',
              bookingId
            );
            
            console.log('Test message sent successfully to existing chat!');
            console.log('Message data:', messageResponse);
            
            return {
              success: true,
              message: 'Successfully sent message to existing chat',
              data: {
                chatId: existingChat.validChatId,
                messageResponse
              }
            };
          } catch (messagingError) {
            console.error('Failed to send test message to existing chat:', messagingError);
            
            // If sending message fails, try creating a new chat anyway
            console.log('Will try creating a new chat as fallback...');
          }
        } else {
          console.log('No existing chat found, will create a new one');
        }
      } catch (validationError) {
        console.error('Error validating if chat exists:', validationError);
        console.log('Will attempt to create a new chat anyway');
      }
      
      // Step 3b: Create a new chat
      console.log('\n[Step 3b] Creating new chat...');
      try {
        const newChat = await chatService.createChatForBooking(bookingId, '');
        
        if (!newChat || !newChat._id) {
          return {
            success: false,
            message: 'Failed to create new chat',
            error: 'No chat ID returned'
          };
        }
        
        console.log('Chat created successfully!');
        console.log('Chat data:', newChat);
        
        // Step 4: Send a test message to the new chat
        console.log('\n[Step 4] Sending test message to new chat...');
        try {
          const messageResponse = await chatService.sendMessage(
            newChat._id,
            'This is a test message to newly created chat',
            'text',
            bookingId
          );
          
          console.log('Test message sent successfully to new chat!');
          console.log('Message data:', messageResponse);
          
          return {
            success: true,
            message: 'Successfully created chat and sent message',
            data: {
              chatId: newChat._id,
              chat: newChat,
              messageResponse
            }
          };
        } catch (messagingError) {
          console.error('Failed to send test message to new chat:', messagingError);
          
          return {
            success: true,
            message: 'Created chat but failed to send test message',
            data: {
              chatId: newChat._id,
              chat: newChat
            },
            error: messagingError
          };
        }
      } catch (chatCreationError) {
        console.error('Failed to create chat:', chatCreationError);
        
        return {
          success: false,
          message: 'Failed to create new chat',
          error: chatCreationError
        };
      }
    } catch (error) {
      console.error('Unexpected error during chat creation test:', error);
      return {
        success: false,
        message: 'Unexpected error during chat creation test',
        error
      };
    }
  },

  // Join a chat room via HTTP API (useful when socket connection fails)
  joinChatRoom: async (chatId: string, bookingId?: string) => {
    try {
      console.log(`Attempting to join chat room via HTTP API: ${chatId || bookingId}`);
      
      // Create a payload with available IDs
      const payload: any = {};
      if (chatId) payload.chatId = chatId;
      if (bookingId) payload.bookingId = bookingId;
      
      // Get astrologer info to include in the request
      const astrologerId = await getValidAstrologerId();
      if (astrologerId) {
        payload.astrologerId = astrologerId;
        payload.userType = 'astrologer';
      }
      
      // Make direct API call to join chat room
      const response = await api.post('/chats/join', payload);
      
      if (response.data && response.data.success) {
        console.log('Successfully joined chat room via HTTP API');
        return {
          success: true,
          roomId: response.data.data?.chatId || chatId || null
        };
      }
      
      return { success: false };
    } catch (error) {
      console.error('Error joining chat room via API:', error);
      return { success: false, error };
    }
  },

  // Get chat by ID
  getChatById: async (chatId: string): Promise<any> => {
    try {
      console.log(`Getting chat with ID ${chatId}`);
      
      // Get the astrologer ID
      const astrologerId = await getValidAstrologerId();
      if (!astrologerId) {
        throw new Error('Could not determine astrologer ID');
      }
      
      // Construct headers
      const token = await AsyncStorage.getItem('token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER,
        'User-Agent': 'astrologer-app-mobile',
        'X-App-Platform': Platform.OS,
        'X-Astrologer-Id': astrologerId
      };
      
      // Try to get the chat by ID directly
      const response = await api.get(`/chats/${chatId}`, { headers });
      console.log(`Successfully retrieved chat with ID ${chatId}`);
      return response.data.data;
    } catch (error: any) {
      console.error(`Error getting chat by ID ${chatId}:`, error.message);
      
      // Mark specific error types for better handling
      if (error.response?.status === 403) {
        // For bookings we know about, mark in cache that we don't have permission
        const bookingIdForChat = await findBookingIdForChat(chatId);
        if (bookingIdForChat) {
          setCachedChatId(bookingIdForChat, chatId, { permissionDenied: true });
        }
        throw new Error('Permission denied accessing this chat');
      }
      
      if (error.response?.status === 404) {
        // For bookings we know about, mark in cache that this chat was not found
        const bookingIdForChat = await findBookingIdForChat(chatId);
        if (bookingIdForChat) {
          setCachedChatId(bookingIdForChat, chatId, { notFound: true });
        }
        throw new Error(`Chat ${chatId} not found`);
      }
      
      throw error;
    }
  },
};

// Export the test function for easy access
export const testChatCreation = chatService.testChatCreation;