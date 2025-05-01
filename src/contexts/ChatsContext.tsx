import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { chatService } from '../services/chatService';
import * as socketService from '../services/socketService';

// Define chat types
export type Message = {
  _id: string;
  sender: string;
  senderType: 'user' | 'astrologer';
  message: string;
  timestamp: string;
  read: boolean;
  attachments?: Array<{
    type: string;
    url: string;
    mimetype: string;
  }>;
};

export type ChatStatus = 'active' | 'pending' | 'waiting' | 'completed';

export type Chat = {
  _id: string;
  booking: string;
  user: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
  messages: Message[];
  updatedAt: string;
  status?: ChatStatus;
  isAstrologerJoined?: boolean;
  bookingRequestId?: string;
  userId?: string;
  astrologerId?: string;
  lastMessageAt?: string;
};

// Context type definition
type ChatsContextType = {
  chats: Chat[];
  loading: boolean;
  error: string | null;
  refreshChats: () => Promise<void>;
  joinChat: (chatId: string) => Promise<boolean>;
  sendMessage: (chatId: string, bookingId: string, message: string) => Promise<boolean>;
  markMessagesAsRead: (chatId: string) => Promise<void>;
  getUnreadCount: () => number;
  getChatById: (chatId: string) => Chat | undefined;
};

// Create context with default values
const ChatsContext = createContext<ChatsContextType>({
  chats: [],
  loading: false,
  error: null,
  refreshChats: async () => {},
  joinChat: async () => false,
  sendMessage: async () => false,
  markMessagesAsRead: async () => {},
  getUnreadCount: () => 0,
  getChatById: () => undefined,
});

// Provider component
export const ChatsProvider = ({ children }: { children: ReactNode }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  
  // Set up socket connection and listeners
  useEffect(() => {
    let socket: any = null;
    
    const connectToSocket = async () => {
      try {
        console.log('Connecting to socket from ChatsProvider...');
        socket = await socketService.connectSocket();
        
        if (socket) {
          console.log('Socket connected successfully in ChatsProvider');
          setSocketConnected(true);
          
          // Set up message listener to refresh chats when a new message arrives
          socket.on('chat:message', (data: any) => {
            console.log('New chat message received, refreshing chats');
            refreshChats();
          });
          
          // Set up listener for chat status changes
          socket.on('chat:status_change', (data: any) => {
            console.log('Chat status changed, refreshing chats');
            refreshChats();
          });
          
          // Set up listener for astrologer joined event
          socket.on('chat:astrologer_joined', (data: any) => {
            console.log('Astrologer joined chat, refreshing chats');
            refreshChats();
          });
        }
      } catch (error) {
        console.error('Error connecting to socket in ChatsProvider:', error);
        setSocketConnected(false);
      }
    };
    
    // Connect to socket
    connectToSocket();
    
    // Load initial chats
    refreshChats();
    
    // Clean up socket connection on unmount
    return () => {
      if (socket) {
        console.log('Disconnecting socket in ChatsProvider cleanup');
        socketService.disconnectSocket();
      }
    };
  }, []);
  
  // Set up periodic refresh for chats
  useEffect(() => {
    // Refresh chats every 30 seconds
    const intervalId = setInterval(() => {
      console.log('Auto-refreshing chats...');
      refreshChats();
    }, 30000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);
  
  // Refresh chats data
  const refreshChats = async () => {
    try {
      setLoading(true);
      const data = await chatService.getAstrologerChats();
      
      // If data is empty or undefined, set empty array
      if (!data || !Array.isArray(data)) {
        console.log('No chats data returned or invalid format, using empty array');
        setChats([]);
        return;
      }
      
      console.log(`Received ${data.length} chats from service`);
      
      // Sort chats by most recent activity
      const sortedChats = data.sort((a: Chat, b: Chat) => {
        // Use updatedAt or lastMessageAt, whichever is available
        const dateA = new Date(a.updatedAt || a.lastMessageAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.lastMessageAt || 0).getTime();
        return dateB - dateA;
      });
      
      setChats(sortedChats);
      setError(null);
    } catch (err) {
      console.error('Error loading chats:', err);
      setError('Failed to load chats. Please try again.');
      // Ensure we set empty chats array in case of error
      setChats([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Join a chat as an astrologer
  const joinChat = async (chatId: string) => {
    try {
      await chatService.joinChat(chatId);
      
      // Update the local chat state
      const updatedChats = chats.map(chat => {
        if (chat._id === chatId) {
          return {
            ...chat,
            isAstrologerJoined: true,
            status: 'active' as ChatStatus
          };
        }
        return chat;
      });
      
      setChats(updatedChats);
      return true;
    } catch (error) {
      console.error('Error joining chat:', error);
      return false;
    }
  };
  
  // Send a message in a chat
  const sendMessage = async (chatId: string, bookingId: string, message: string) => {
    try {
      await chatService.sendMessage(chatId, bookingId, message);
      
      // Refresh chats to get the updated messages
      await refreshChats();
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  };
  
  // Mark messages as read
  const markMessagesAsRead = async (chatId: string) => {
    try {
      await chatService.markMessagesAsRead(chatId);
      
      // Update local state
      const updatedChats = chats.map(chat => {
        if (chat._id === chatId) {
          return {
            ...chat,
            messages: chat.messages.map(msg => ({
              ...msg,
              read: true
            }))
          };
        }
        return chat;
      });
      
      setChats(updatedChats);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };
  
  // Get total unread message count
  const getUnreadCount = () => {
    let count = 0;
    
    chats.forEach(chat => {
      chat.messages.forEach(msg => {
        if (msg.senderType === 'user' && !msg.read) {
          count++;
        }
      });
    });
    
    return count;
  };
  
  // Get a chat by ID
  const getChatById = (chatId: string) => {
    return chats.find(chat => chat._id === chatId);
  };
  
  return (
    <ChatsContext.Provider value={{
      chats,
      loading,
      error,
      refreshChats,
      joinChat,
      sendMessage,
      markMessagesAsRead,
      getUnreadCount,
      getChatById
    }}>
      {children}
    </ChatsContext.Provider>
  );
};

// Custom hook for using the context
export const useChats = () => useContext(ChatsContext); 