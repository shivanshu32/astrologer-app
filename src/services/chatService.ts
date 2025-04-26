import axios from 'axios';
import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Get auth token from AsyncStorage
const getAuthToken = async () => {
  const token = await AsyncStorage.getItem('authToken');
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

export const chatService = {
  // Get all chats for the authenticated astrologer
  getAstrologerChats: async () => {
    try {
      const response = await api.get('/api/chats');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching astrologer chats:', error);
      throw error;
    }
  },
  
  // Get chat by booking ID
  getChatByBookingId: async (bookingId: string) => {
    try {
      const response = await api.get(`/api/chats/booking/${bookingId}`);
      return response.data.data;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        // Chat doesn't exist yet, return null
        return null;
      }
      console.error('Error fetching chat by booking ID:', error);
      throw error;
    }
  },
  
  // Create a new chat
  createChat: async (bookingId: string, userId: string) => {
    try {
      const astrologerId = await AsyncStorage.getItem('profileId');
      
      const response = await api.post(`/api/chats/booking/${bookingId}/messages`, {
        message: 'Hello! How can I help you today?',
        userId,
        astrologerId
      });
      
      // The response will include the chatId in data.chatId
      const chat = await chatService.getChatByBookingId(bookingId);
      return chat;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  },
  
  // Send a message in a chat
  sendMessage: async (chatId: string, bookingId: string, message: string, attachments: any[] = []) => {
    try {
      const response = await api.post(`/api/chats/booking/${bookingId}/messages`, {
        message,
        attachments
      });
      return response.data.data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  },
  
  // Mark messages as read
  markMessagesAsRead: async (chatId: string) => {
    try {
      const response = await api.put(`/api/chats/${chatId}/read`);
      return response.data.data;
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw error;
    }
  },
  
  // Get unread message count
  getUnreadMessageCount: async () => {
    try {
      const chats = await chatService.getAstrologerChats();
      let unreadCount = 0;
      
      chats.forEach((chat: any) => {
        chat.messages.forEach((message: any) => {
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
  }
}; 