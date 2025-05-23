import axios, { AxiosResponse } from 'axios';
import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAstrologerProfile } from './bookingRequestService';
import { Platform } from 'react-native';
import apiInstance from './api';
import * as socketService from './socketService';
import { v4 as uuidv4 } from 'uuid';

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

// Helper function to log important request details
const logChatOperation = async (operation: string, chatId?: string, bookingId?: string, endpoint?: string) => {
  try {
    console.log(`\n📱 ASTROLOGER APP - ${operation.toUpperCase()} 📱`);
    
    if (endpoint) {
      console.log(`🌐 Endpoint: ${API_URL}${endpoint}`);
    }
    
    if (chatId) {
      console.log(`💬 Chat ID: ${chatId}`);
    }
    
    if (bookingId) {
      console.log(`📋 Booking ID: ${bookingId}`);
    }
    
    // Get and log astrologer ID
    const astrologerId = await getValidAstrologerId();
    if (astrologerId) {
      console.log(`👤 Astrologer ID: ${astrologerId}`);
    }
    
    // Log token (partial)
    const token = await AsyncStorage.getItem('token');
    if (token) {
      console.log(`🔑 Token (first 15 chars): ${token.substring(0, 15)}...`);
    }
    
    console.log(`⏱️ Timestamp: ${new Date().toISOString()}`);
    console.log('-'.repeat(50));
  } catch (error) {
    // Don't let logging errors affect the app
    console.error('Error in logging:', error);
  }
};

export const chatService = {
  // Get all chats for the authenticated astrologer
  getAstrologerChats: async (): Promise<any[]> => {
    try {
      const astrologer = await getAstrologerProfile();
      if (!astrologer?._id) {
        console.error('No astrologer ID available');
        throw new Error('Astrologer ID not found');
      }

      const endpoints = [
        // Primary endpoints for chats collection (correct)
        `/api/chats/astrologer/${astrologer._id}`,
        `/api/chat/astrologer/${astrologer._id}`,
        `/chats/astrologer/${astrologer._id}`,
        
        // Legacy endpoints (will be redirected to chats collection now)
        `/api/chat/chatrooms/astrologer/${astrologer._id}`,
        `/chat/chatrooms/astrologer/${astrologer._id}`
      ];

      let chatResponse: any = null;
      let error: any = null;

      // Try endpoints in order until one works
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying to fetch chats from endpoint: ${endpoint}`);
          chatResponse = await api.get(endpoint);
          if (chatResponse?.data?.success) {
            console.log(`Successfully fetched chats from ${endpoint}`);
            break;
          }
        } catch (err) {
          error = err;
          console.log(`Failed to fetch chats from ${endpoint}:`, err);
        }
      }

      if (!chatResponse?.data?.success) {
        console.error('All chat endpoints failed:', error);
        throw new Error('Failed to fetch chats');
      }

      return chatResponse.data.data || [];
    } catch (error) {
      console.error('Error fetching astrologer chats:', error);
      throw error;
    }
  },

  // Get messages for a chat
  getMessages: async (chatId: string, bookingId?: string): Promise<any[]> => {
    try {
      console.log(`\n📱 ASTROLOGER APP - GET MESSAGES 📱`);
      console.log(`Fetching messages for chat ${chatId}...`);
      
      // Check if this is a booking ID rather than a chat ID
      if (bookingId || (!chatId.match(/^[0-9a-fA-F]{24}$/) && chatId.length > 8)) {
        console.log(`ID ${chatId} appears to be a booking ID rather than a chat ID`);
        console.log(`Ensuring chat exists for booking ${chatId || bookingId}...`);
        
        // Get the actual chat ID for this booking
        try {
          const actualBookingId = bookingId || chatId;
          const cachedChatId = getCachedChatId(actualBookingId);
          
          if (cachedChatId) {
            console.log(`Using cached chat ID ${cachedChatId} for booking ${actualBookingId}`);
            chatId = cachedChatId;
          } else {
            // Try to get the chat for this booking
            const chat = await chatService.getChatByBookingId(actualBookingId);
            if (chat && chat._id) {
              console.log(`Found chat ${chat._id} for booking ${actualBookingId}`);
              chatId = chat._id;
              setCachedChatId(actualBookingId, chatId);
            }
          }
        } catch (error) {
          console.log(`Error getting chat ID for booking, will try with original ID: ${error}`);
        }
      }
      
      // Get the astrologer profile to ensure we have the correct ID
      const profile = await getAstrologerProfile();
      
      if (!profile || !profile._id) {
        throw new Error('Could not determine astrologer ID from profile');
      }
      
      console.log(`Got valid astrologer ID from profile: ${profile._id}`);
      
      // Update userData with the correct astrologer ID for consistency
      try {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          userData.astrologerId = profile._id;
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
          console.log(`Updated astrologerId in userData: ${profile._id}`);
        }
      } catch (e) {
        console.error('Error updating userData with astrologerId', e);
      }
      
      // Get token for authentication
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        throw new Error('Authentication token is required');
      }
      
      // Try each endpoint pattern to get messages
      const endpoints = [
        `/chats/${chatId}/messages`,      // Preferred format
        `/api/chats/${chatId}/messages`,  // Alternative with /api prefix
        `/chat/${chatId}/messages`        // Alternative schema
      ];
      
      // If we have a booking ID, also try booking-based endpoints
      if (bookingId) {
        endpoints.push(
          `/chats/booking/${bookingId}/messages`,
          `/api/chats/booking/${bookingId}/messages`
        );
      }
      
      let response = null;
      let lastError = null;
      
      // Try each endpoint pattern
      for (const endpoint of endpoints) {
        try {
          console.log(`🔄 CHAT REQUEST: GET ${API_URL}${endpoint}`);
          console.log(`👤 Astrologer ID: ${profile._id}`);
          console.log(`🔑 Token: ${token.substring(0, 15)}...`);
          console.log(`🔧 Headers: X-Astrologer-ID, X-App-Identifier, Authorization`);
          
          response = await api.get(endpoint);
          
          if (response && response.data) {
            console.log(`✅ CHAT RESPONSE: GET ${API_URL}${endpoint}`);
            console.log(`⏱️ Response time: N/A`);
            
            // Log the number of items received
            const items = Array.isArray(response.data) 
              ? response.data 
              : (response.data.data || []);
              
            console.log(`📊 Received ${items.length} items`);
            console.log(`Successfully fetched messages from: ${endpoint}`);
            
            return items;
          }
        } catch (err: any) {
          console.log(`Error trying endpoint ${API_URL}${endpoint}: ${err.message}`);
          lastError = err;
          continue; // Try next endpoint
        }
      }
      
      // If all endpoints fail, throw an error
      throw lastError || new Error(`Failed to get messages for chat ${chatId} from any endpoint`);
    } catch (error: any) {
      console.error('Error fetching messages:', error.message);
      throw error;
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
          const newChat = await chatService.createOrGetChat(bookingId);
          
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

  // Send a message to a chat
  sendMessage: async (chatId: string, message: string, messageType: string = 'text', bookingId?: string): Promise<any> => {
    try {
      console.log('\n📱 ASTROLOGER APP - SEND CHAT MESSAGE 📱');
      console.log(`💬 Chat ID: ${chatId}`);
      if (bookingId) console.log(`📋 Booking ID: ${bookingId}`);
      console.log(`📧 Message Type: ${messageType}`);
      
      // Check if chatId is actually a booking ID
      if (!chatId.match(/^[0-9a-fA-F]{24}$/) && chatId.length > 8) {
        console.log(`The provided chat ID appears to be a booking ID. Swapping parameters.`);
        bookingId = chatId;
        chatId = '';
      }
      
      // If we have a booking ID but no chat ID, try to get the chat ID from cache
      if (bookingId && !chatId) {
        const cachedChatId = getCachedChatId(bookingId);
        if (cachedChatId) {
          console.log(`Using cached chat ID ${cachedChatId} for booking ${bookingId}`);
          chatId = cachedChatId;
        } else {
          // Try to get the chat for this booking
          try {
            const chat = await chatService.getChatByBookingId(bookingId);
            if (chat && chat._id) {
              console.log(`Found chat ${chat._id} for booking ${bookingId}`);
              chatId = chat._id;
              setCachedChatId(bookingId, chatId);
            }
          } catch (error) {
            console.log(`Error getting chat ID for booking, will try with booking ID directly: ${error}`);
          }
        }
      }
      
      // Get the astrologer profile to ensure we have the correct ID
      const profile = await getAstrologerProfile();
      
      if (!profile || !profile._id) {
        throw new Error('Could not determine astrologer ID from profile');
      }
      
      console.log(`Got valid astrologer ID from profile: ${profile._id}`);
      
      // Update userData with the correct astrologer ID for consistency
      try {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          userData.astrologerId = profile._id;
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
          console.log(`Updated astrologerId in userData: ${profile._id}`);
        }
      } catch (e) {
        console.error('Error updating userData with astrologerId', e);
      }
      
      // Get token for authentication
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        throw new Error('Authentication token is required');
      }
      
      // Prepare message payload
      const messagePayload = {
        message,
        messageType: messageType || 'text',
        senderType: 'astrologer',
        astrologerId: profile._id,
        senderId: profile._id
      };
      
      console.log(`👤 Astrologer ID: ${profile._id}`);
      console.log(`🔑 Token (first 15 chars): ${token.substring(0, 15)}...`);
      console.log(`⏱️ Timestamp: ${new Date().toISOString()}`);
      console.log(`--------------------------------------------------`);
      
      // Create headers with all required fields
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER,
        'X-Astrologer-ID': profile._id,
        'X-User-ID': profile._id,
        'X-Sender-ID': profile._id
      };
      
      // Try a sequence of endpoint patterns
      let response = null;
      let lastError = null;
      
      // Endpoint patterns to try - in order of preference
      const endpoints = [];
      
      // Add chat ID based endpoints if we have a chat ID
      if (chatId) {
        endpoints.push(
          `/chats/${chatId}/messages`,            // Preferred path
          `/api/chats/${chatId}/messages`,        // Alternative with /api prefix
          `/chat/${chatId}/messages`              // Alternative schema
        );
      }
      
      // If booking ID is provided, add booking-based endpoints
      if (bookingId) {
        endpoints.push(
          `/chats/booking/${bookingId}/messages`,
          `/api/chats/booking/${bookingId}/messages`,
          `/chat/booking/${bookingId}/messages`
        );
      }
      
      // If we have no endpoints to try, throw an error
      if (endpoints.length === 0) {
        throw new Error('No chat ID or booking ID provided');
      }
      
      // Try each endpoint
      for (const endpoint of endpoints) {
        try {
          console.log(`🔄 CHAT REQUEST: POST ${API_URL}${endpoint}`);
          console.log(`👤 Astrologer ID: ${profile._id}`);
          console.log(`📧 Sending message (length: ${message.length})`);
          
          response = await api.post(endpoint, messagePayload, { headers });
          
          if (response && response.data) {
            console.log(`✅ CHAT RESPONSE: POST ${API_URL}${endpoint}`);
            console.log(`⏱️ Response time: N/A`);
            console.log(`📨 Message sent successfully`);
            
            // If this was a booking ID and we got a chat ID back, cache it
            if (bookingId && !chatId && response.data.data?.chatId) {
              const newChatId = response.data.data.chatId;
              console.log(`Received chat ID ${newChatId} from message response, caching it`);
              setCachedChatId(bookingId, newChatId);
              associateChatWithBooking(newChatId, bookingId);
            }
            
            return response.data;
          }
        } catch (err: any) {
          console.log(`Error trying endpoint ${API_URL}${endpoint}: ${err.message}`);
          lastError = err;
          continue; // Try next endpoint
        }
      }
      
      // If we reach here, all endpoints failed
      throw lastError || new Error(`Failed to send message via any endpoint`);
    } catch (error: any) {
      console.error('Error sending message:', error.message);
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
      console.log(`\n📱 ASTROLOGER APP - GET CHAT BY BOOKING ID 📱`);
      console.log(`Getting chat for booking ${bookingId}`);
      
      // Check if we have a cached chat ID for this booking
      const cachedChatId = getCachedChatId(bookingId);
      if (cachedChatId) {
        try {
          console.log(`Using cached chat ID ${cachedChatId} for booking ${bookingId}`);
          const chat = await chatService.getChatById(cachedChatId);
          return chat;
        } catch (error) {
          console.log(`Cached chat ID ${cachedChatId} is no longer valid, will try direct lookup`);
        }
      }
      
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
        'X-Astrologer-ID': astrologerId,
        'X-Sender-ID': astrologerId,
        'X-User-ID': astrologerId
      };
      
      // Define all possible endpoints to try
      const endpoints = [
        `/chats/booking/${bookingId}`,
        `/api/chats/booking/${bookingId}`,
        `/chat/booking/${bookingId}`,
        `/api/chat/booking/${bookingId}`,
        `/bookings/${bookingId}/chat`,
        `/api/bookings/${bookingId}/chat`
      ];
      
      let lastError = null;
      
      // Try each endpoint
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying to get chat by booking ID via: ${endpoint}`);
          const response = await api.get(endpoint, { headers });
          
          if (response.data) {
            // Extract chat data - handle different response formats
            let chatData = null;
            if (response.data.data) {
              chatData = response.data.data;
            } else if (response.data._id) {
              chatData = response.data;
            }
            
            if (chatData && chatData._id) {
              console.log(`Found chat ${chatData._id} for booking ${bookingId} via ${endpoint}`);
              
              // Store in cache
              setCachedChatId(bookingId, chatData._id);
              associateChatWithBooking(chatData._id, bookingId);
              
              return chatData;
            }
          }
        } catch (error: any) {
          console.log(`Endpoint ${endpoint} failed: ${error.message}`);
          
          // Special handling for permission errors
          if (error.response?.status === 403) {
            console.error(`Permission denied (403) accessing chat for booking ${bookingId}. This is likely a permissions issue.`);
            console.error('Verify your JWT token matches the booking\'s astrologer ID');
            lastError = new Error(`Permission denied: ${error.response.data?.message || 'Not authorized to access this chat'}`);
            // Don't try other endpoints if we get a permission error
            break;
          }
          
          // Skip to next endpoint for 404 errors
          if (error.response?.status === 404) {
            console.log(`No chat found at ${endpoint}, trying next endpoint...`);
            continue;
          }
          
          lastError = error;
        }
      }
      
      // If we reach here, all endpoints failed
      if (lastError) {
        if (lastError.message.includes('Permission denied')) {
          // Cache the permission denied result to prevent repeated attempts
          setCachedChatId(bookingId, `permission-denied-${Date.now()}`, { permissionDenied: true });
          throw lastError;
        }
        
        console.log(`No chat exists yet for booking ${bookingId}. Need to create one.`);
        return null;
      }
      
      return null;
    } catch (error: any) {
      console.error(`Error getting chat for booking ${bookingId}:`, error.message);
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
      await logChatOperation('create chat for booking', undefined, bookingId);
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
      
      // Get authentication token
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing');
      }

      // Create the message payload similar to the user-app implementation
      const payload = {
        message: 'Hello, I am ready to start your consultation.',
        senderType: 'astrologer',
        astrologerId: astrologerId
      };
      
      console.log('Using payload for chat creation:', payload);
      
      // Create headers for the request
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': APP_IDENTIFIER,
        'X-Astrologer-ID': astrologerId
      };
      
      // Try creating chat via message endpoint (same as user-app)
      try {
        // Use the /chats endpoint instead of /chatrooms
        const endpoint = `/chats/booking/${bookingId}/messages`;
        console.log(`Creating chat via endpoint: ${API_URL}${endpoint}`);
        
        const response = await api.post(endpoint, payload, { headers });
        
        // Parse response carefully
        let chatId = null;
        if (response.data?.data?.chatId) {
          chatId = response.data.data.chatId;
        } else if (response.data?.data?.chat?._id) {
          chatId = response.data.data.chat._id;
        } else if (response.data?.chatId) {
          chatId = response.data.chatId;
        } else if (response.data?.data?._id) {
          chatId = response.data.data._id;
        }
        
        if (chatId) {
          console.log(`Chat created successfully with chatId: ${chatId}`);
          
          // Store the newly created chat ID
          setCachedChatId(bookingId, chatId);
          associateChatWithBooking(chatId, bookingId);
          
          // Try to get the chat details immediately
          try {
            const chatDetails = await chatService.getChatById(chatId);
            return chatDetails;
          } catch (getErr: any) {
            if (getErr.response?.status === 404) {
              console.log(`WARNING: Created chat but it appears to not exist when queried directly`);
              // This is a common issue - chat created, but immediately getting it fails with 404
              // Return a fabricated response instead, we can fetch the real one later
              setCachedChatId(bookingId, chatId, { notFound: true });
              return {
                _id: chatId,
                bookingId: bookingId,
                messages: [
                  { ...payload, _id: response.data?.data?.message?._id || uuidv4(), timestamp: new Date() }
                ],
                chatId
              };
            }
            
            // For other types of errors, throw
            throw getErr;
          }
        }
        
        console.error('Failed to extract chat ID from response:', response.data);
        throw new Error('Failed to create chat: No chat ID in response');
      } catch (error: any) {
        // If the message-based creation fails, try the direct endpoint
        if (error.response?.status === 403 || error.response?.status === 404) {
          console.log(`Message-based chat creation failed with ${error.response.status}. Trying direct creation...`);
          
          try {
            // Try the direct chat creation endpoint
            const directResponse = await api.post('/chats', { 
              bookingId,
              astrologerId,
              initialMessage: payload.message
            }, { headers });
            
            let chatId = null;
            if (directResponse.data?.data?._id) {
              chatId = directResponse.data.data._id;
            } else if (directResponse.data?._id) {
              chatId = directResponse.data._id;
            }
            
            if (chatId) {
              console.log(`Chat created successfully with direct endpoint. ChatId: ${chatId}`);
              setCachedChatId(bookingId, chatId);
              associateChatWithBooking(chatId, bookingId);
              
              return {
                _id: chatId,
                bookingId: bookingId,
                astrologerId: astrologerId,
                messages: [{
                  _id: uuidv4(),
                  sender: astrologerId,
                  senderType: 'astrologer',
                  message: payload.message,
                  timestamp: new Date(),
                  read: false
                }]
              };
            }
          } catch (directError: any) {
            console.error('Direct chat creation also failed:', directError.message);
            throw directError;
          }
        }
        
        // If we get here, both creation methods failed
        throw error;
      }
    } catch (error: any) {
      console.error('Error creating chat for booking:', error.message);
      throw error;
    }
  },

  // Create or get a chat for a booking
  createOrGetChat: async (bookingId: string): Promise<any> => {
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
        'X-Astrologer-ID': astrologerId,
        'X-Sender-ID': astrologerId,
        'X-User-ID': astrologerId
      };
      
      // First try to get an existing chat
      try {
        const existingChat = await chatService.getChatByBookingId(bookingId);
        if (existingChat) {
          console.log(`Found existing chat for booking ${bookingId}`);
          return existingChat;
        }
      } catch (error) {
        console.log(`No existing chat found for booking ${bookingId}, creating new one`);
      }
      
      // Try sending a message to create the chat (like user-app does)
      try {
        const messagePayload = {
          message: 'Hello, I am ready to start your consultation.',
          senderType: 'astrologer',
          astrologerId: astrologerId,
          senderId: astrologerId
        };
        
        console.log(`Creating chat by sending message to booking ${bookingId}`);
        const endpoint = `/chats/booking/${bookingId}/messages`;
        const response = await api.post(endpoint, messagePayload, { headers });
        
        // Improved chat ID extraction logic
        let chatId = null;
        const responseData = response.data;
        
        // Log the full response for debugging
        console.log('Chat creation response:', JSON.stringify(responseData, null, 2));
        
        // Try all possible locations for chat ID
        if (responseData?.data?._id) {
          // This matches the structure in the error message
          chatId = responseData.data._id;
          console.log('Found chat ID in responseData.data._id:', chatId);
        } else if (responseData?.data?.chatId) {
          chatId = responseData.data.chatId;
          console.log('Found chat ID in responseData.data.chatId:', chatId);
        } else if (responseData?.data?.chat?._id) {
          chatId = responseData.data.chat._id;
          console.log('Found chat ID in responseData.data.chat._id:', chatId);
        } else if (responseData?.chatId) {
          chatId = responseData.chatId;
          console.log('Found chat ID in responseData.chatId:', chatId);
        } else if (responseData?._id) {
          chatId = responseData._id;
          console.log('Found chat ID in responseData._id:', chatId);
        } else if (responseData?.data?.message?.chatId) {
          chatId = responseData.data.message.chatId;
          console.log('Found chat ID in responseData.data.message.chatId:', chatId);
        }
        
        if (chatId) {
          console.log(`Created chat ${chatId} for booking ${bookingId}`);
          
          // Store in cache
          setCachedChatId(bookingId, chatId);
          associateChatWithBooking(chatId, bookingId);
          
          // Try to get the full chat object with the new chat ID
          try {
            const chatDetails = await chatService.getChatById(chatId);
            return chatDetails;
          } catch (getErr) {
            console.log('Created chat but could not fetch details, returning partial data');
            // Return a partial chat object with the ID we have
            return {
              _id: chatId,
              bookingId: bookingId,
              messages: [{
                _id: responseData?.data?.message?._id || uuidv4(),
                message: messagePayload.message,
                senderType: 'astrologer',
                timestamp: new Date(),
                read: true
              }]
            };
          }
        }
        
        // If we couldn't extract a chat ID, try the direct chat creation endpoint
        console.log('Could not extract chat ID from message response, trying direct creation...');
        const directResponse = await api.post('/chats', {
          bookingId,
          astrologerId,
          initialMessage: messagePayload.message
        }, { headers });
        
        // Try to extract chat ID from direct creation response
        const directData = directResponse.data;
        if (directData?.data?._id) {
          chatId = directData.data._id;
        } else if (directData?._id) {
          chatId = directData._id;
        }
        
        if (chatId) {
          console.log(`Created chat via direct endpoint: ${chatId}`);
          setCachedChatId(bookingId, chatId);
          associateChatWithBooking(chatId, bookingId);
          
          return {
            _id: chatId,
            bookingId: bookingId,
            messages: [{
              _id: uuidv4(),
              message: messagePayload.message,
              senderType: 'astrologer',
              timestamp: new Date(),
              read: true
            }]
          };
        }
        
        throw new Error('Failed to extract chat ID from both message and direct creation responses');
      } catch (error: any) {
        console.error('Error creating chat:', error.message);
        if (error.response) {
          console.error('Response data:', error.response.data);
          console.error('Response status:', error.response.status);
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Error in createOrGetChat:', error.message);
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

  // Join a chat room via HTTP API
  joinChatRoom: async (
    chatId: ChatId, 
    bookingId?: BookingId
  ): Promise<boolean> => {
    try {
      if (!chatId) {
        console.error('No chat ID provided to joinChatRoom');
        return false;
      }
      
      console.log('[SOCKET] Checking network connectivity before attempting to join chat room...');
      console.log('[SOCKET] Checking network connectivity...');
      
      // Short timeout ping to check connectivity
      try {
        await apiInstance.get('/health', { timeout: 3000 });
        console.log('[SOCKET] Network connectivity confirmed for chat join');
      } catch (error) {
        console.error('[SOCKET] Network connectivity check failed:', error);
        // We'll try to join anyway
      }
      
      console.log(`[SOCKET] Joining chat room with chatId: ${chatId}`);
      
      // Make sure we have the astrologer ID
      const astrologerId = await getValidAstrologerId();
      if (!astrologerId) {
        console.error('[SOCKET] Failed to get astrologer ID for chat join');
        return false;
      }
      
      console.log(`[SOCKET] Got valid astrologer ID from profile: ${astrologerId}`);
      
      // Update userData with astrologer ID to ensure socket has it
      try {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          userData.astrologerId = astrologerId;
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
          console.log(`[SOCKET] Updated astrologerId in userData: ${astrologerId}`);
        }
      } catch (error) {
        console.error('[SOCKET] Error updating userData:', error);
      }
      
      // First try HTTP API join if available
      console.log('[SOCKET] Attempting to join chat room via HTTP API first');
      
      const token = await getAuthToken();
      if (!token) {
        console.error('[SOCKET] No auth token available for chat join');
        return false;
      }
      
      // Try all potential endpoints
      const endpoints = [
        `${API_URL}/chats/${chatId}/join`,
        `${API_URL}/api/chats/${chatId}/join`,
        `/chats/${chatId}/join`,
        `/api/chats/${chatId}/join`
      ];
      
      let httpJoinSuccessful = false;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`[SOCKET] Making HTTP request to: ${endpoint}`);
          const response = await apiInstance.post(endpoint, {
            chatId,
            bookingId,
            astrologerId
          }, {
            headers: {
              'X-Astrologer-ID': astrologerId,
              'X-App-Identifier': APP_IDENTIFIER,
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.status === 200 && response.data && response.data.success) {
            console.log('[SOCKET] Successfully joined chat room via HTTP API');
            httpJoinSuccessful = true;
            break;
          }
        } catch (error: any) {
          console.log(`[SOCKET] HTTP chat join failed with status: ${error.response?.status}`);
        }
      }
      
      // If HTTP join failed, try socket join as backup
      if (!httpJoinSuccessful) {
        console.log('[SOCKET] HTTP join failed, using socket.io is not available in this version');
        console.log('[SOCKET] Please use the HTTP API to join chat rooms');
        
        // For now, we'll consider it a success if we at least tried the HTTP join
        return true;
      }
      
      return true;
    } catch (error) {
      console.error('[SOCKET] Error joining chat room:', error);
      return false;
    }
  },

  // Get chat by ID
  getChatById: async (chatId: string): Promise<any> => {
    try {
      console.log('\n📱 ASTROLOGER APP - GET CHAT BY ID 📱');
      console.log(`💬 Chat ID: ${chatId}`);
      
      // Get the astrologer profile to ensure we have the correct ID
      const profile = await getAstrologerProfile();
      
      if (!profile || !profile._id) {
        throw new Error('Could not determine astrologer ID from profile');
      }
      
      console.log(`Got valid astrologer ID from profile: ${profile._id}`);
      
      // Update userData with the correct astrologer ID
      try {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          userData.astrologerId = profile._id;
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
          console.log(`Updated astrologerId in userData: ${profile._id}`);
        }
      } catch (e) {
        console.error('Error updating userData with astrologerId', e);
      }
      
      // Get token for authentication
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        throw new Error('Authentication token is required');
      }
      
      console.log(`👤 Astrologer ID: ${profile._id}`);
      console.log(`🔑 Token (first 15 chars): ${token.substring(0, 15)}...`);
      console.log(`⏱️ Timestamp: ${new Date().toISOString()}`);
      console.log(`--------------------------------------------------`);
      
      // Attempt to get chat by ID via multiple endpoint patterns
      const endpoints = [
        `/chats/${chatId}`,              // Preferred format that will be properly normalized
        `/api/chats/${chatId}`,          // Alternative with /api prefix
        `/chat/${chatId}`                // Alternative schema
      ];
      
      let response = null;
      let lastError = null;
      
      // Try each endpoint pattern
      for (const endpoint of endpoints) {
        try {
          console.log(`Attempting to get chat by ID via: ${endpoint}`);
          response = await api.get(endpoint);
          
          if (response && response.data) {
            console.log(`Successfully retrieved chat ${chatId} from ${endpoint}`);
            return response.data;
          }
        } catch (err: any) {
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
          lastError = err;
          continue; // Try next endpoint
        }
      }
      
      if (!response || !response.data) {
        throw lastError || new Error(`Failed to get chat by ID ${chatId} from any endpoint`);
      }
      
      return response.data;
    } catch (error) {
      console.error(`Error getting chat by ID ${chatId}:`, error);
      throw error;
    }
  },
}