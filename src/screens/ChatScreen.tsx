import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Alert
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { chatService } from '../services/chatService';
import { formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import * as socketService from '../services/socketService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../config';
import { v4 as uuidv4 } from 'uuid';

interface Message {
  _id?: string;
  id?: string;  // Alternative ID property that might be in server response
  message: string;
  content?: string; // Alternative content property that might be used instead of message
  timestamp: Date | string | number;
  createdAt?: Date | string | number; // Alternative timestamp property
  senderType: 'user' | 'astrologer' | 'system';
  read?: boolean;
  sender?: string;
  status?: string;
  senderId?: string;
  receiverId?: string;
  messageType?: string;
  temporaryId?: string;
}

interface ChatData {
  _id: string;
  user: {
    name: string;
    mobileNumber: string;
    _id?: string;
  };
  booking: {
    _id?: string;
    consultationType: string;
    amount: number;
    status: string;
  };
  messages: Message[];
}

// Helper function to extract chat ID from response data
const extractChatId = (data: any): string | null => {
  if (!data) return null;
  
  // Check for chatId in different possible locations and ensure it's a string
  if (data.chatId && typeof data.chatId === 'string') return data.chatId;
  if (data._id && typeof data._id === 'string') return data._id;
  if (data.data?.chatId && typeof data.data.chatId === 'string') return data.data.chatId;
  
  // Convert non-string IDs to strings if possible
  if (data.chatId) return String(data.chatId);
  if (data._id) return String(data._id);
  if (data.data?.chatId) return String(data.data.chatId);
  
  return null;
};

const ChatScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { chatId, bookingId } = route.params;
  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const socketConnected = useRef(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [astrologerId, setAstrologerId] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
  const sentMessages = useRef(new Set());

  // Initialize IDs from route params
  useEffect(() => {
    if (route.params?.chatId) {
      setCurrentChatId(route.params.chatId);
    }
    if (route.params?.bookingId) {
      setCurrentBookingId(route.params.bookingId);
    }
  }, [route.params?.chatId, route.params?.bookingId]);

  // Function to get the astrologer ID
  const getAstrologerId = async () => {
    try {
      // First try to get from profile in AsyncStorage
      const astrologerProfileString = await AsyncStorage.getItem('astrologerProfile');
      if (astrologerProfileString) {
        const profile = JSON.parse(astrologerProfileString);
        if (profile && profile._id) {
          return profile._id;
        }
      }

      // Fallback to direct astrologerId in AsyncStorage
      const directId = await AsyncStorage.getItem('astrologerId');
      if (directId) {
        return directId;
      }

      // Last resort - get from userData if available
      const userDataString = await AsyncStorage.getItem('userData');
      if (userDataString) {
        const userData = JSON.parse(userDataString);
        if (userData && (userData.astrologerId || userData._id)) {
          return userData.astrologerId || userData._id;
        }
      }

      throw new Error('Could not determine astrologer ID');
    } catch (err) {
      console.error('Error getting astrologer ID:', err);
      return null;
    }
  };

  // Connect to socket for this chat
  const connectToSocket = useCallback(async () => {
    if (isConnecting || isConnected) return;
    
    try {
      setIsConnecting(true);
      console.log('Connecting to socket...');
      
      // Connect to socket server
      const socket = await socketService.connectSocket();
      if (!socket) {
        throw new Error('Failed to connect to socket server');
      }
      
      socketConnected.current = true;
      console.log('Socket connected successfully, now joining chat room');
      
      // Get the latest chat ID and booking ID from state or route params
      const chatIdToUse = currentChatId || route.params?.chatId;
      const bookingIdToUse = currentBookingId || route.params?.bookingId;
      
      console.log(`Attempting to join chat room with ID: ${chatIdToUse}`);
      
      // Try joining with chat ID first, passing both chat ID and booking ID
      const joinResult = await socketService.joinChatRoom(chatIdToUse, bookingIdToUse);
      
      if (!joinResult.success) {
        console.log('Failed to join with chat ID, trying with booking ID only');
        
        // If joining with chat ID fails, try with booking ID only
        if (bookingIdToUse && bookingIdToUse !== chatIdToUse) {
          console.log(`Trying to join using booking ID only: ${bookingIdToUse}`);
          
          // Try joining with just the booking ID
          const bookingJoinResult = await socketService.joinChatRoom('', bookingIdToUse);
          
          if (!bookingJoinResult.success) {
            console.error('Failed to join using booking ID');
          } else {
            console.log('Successfully joined chat room with booking ID');
          }
        } else {
          console.error('Failed to join chat room and no booking ID to try with');
        }
      } else {
        console.log('Successfully joined chat room with chat ID');
      }
      
      // Setup socket event listeners regardless of join result
      setupSocketListeners();
      
      setIsConnected(true);
    } catch (err) {
      console.error('Error connecting to socket:', err);
      Alert.alert(
        'Connection Error',
        'Failed to connect to chat server. Please check your internet connection and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting, currentChatId, currentBookingId, route.params?.chatId, route.params?.bookingId]);

  // Setup socket event listeners for real-time chat
  const setupSocketListeners = async () => {
    // Don't set up listeners if socket is not available
    if (!socketService.isSocketConnected()) {
      console.log('Cannot setup listeners - socket not connected');
      return;
    }
    
    const socket = await socketService.connectSocket();
    if (!socket) return;
    
    console.log('Setting up socket event listeners');
    
    // Clean up existing listeners first to prevent duplicates
    const cleanup = async () => {
      console.log('Removing existing socket listeners to prevent duplicates');
      socket.off('chat:newMessage');
      socket.off('chat:typing');
      socket.off('chat:messagesRead');
      socket.off('chat:error');
      socket.off('chat:joined');
    };
    
    await cleanup();
    
    // Set up new listeners
    socket.on('chat:joined', (data) => {
      console.log('Successfully joined chat room:', data);
      
      // If we have a chatId in the response but not in our route params, update the route
      if (data && data.roomId && data.roomId !== route.params.chatId) {
        console.log(`Updating route params with new chat ID from socket: ${data.roomId}`);
        navigation.setParams({ 
          chatId: data.roomId, 
          bookingId: route.params.bookingId 
        });
      }
    });
    
    socket.on('chat:newMessage', (data) => {
      console.log('New message received from socket:', data);
      if (!data || !data.message) {
        console.log('Received invalid message data:', data);
        return;
      }
      
      // Ensure the incoming message conforms to our Message interface
      const rawMessage = data.message as any; // Use type assertion for flexibility
      
      const formattedMessage: Message = {
        _id: rawMessage._id || `temp_${Date.now()}`,
        message: typeof rawMessage.message === 'string' ? rawMessage.message : 
                (typeof rawMessage.content === 'string' ? rawMessage.content : 
                 JSON.stringify(rawMessage)),
        timestamp: rawMessage.timestamp || rawMessage.createdAt || new Date(),
        senderType: rawMessage.senderType || 'user',
        read: rawMessage.read || false,
        sender: rawMessage.sender,
        temporaryId: rawMessage.temporaryId
      };
      
      // Only add the message if we could extract message text
      if (formattedMessage.message) {
        setMessages(prevMessages => [...prevMessages, formattedMessage]);
        
        // Auto-scroll to bottom on new message
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
        
        // Mark messages as read if they're from user
        if (formattedMessage.senderType === 'user' && route.params.chatId) {
          console.log('Marking user message as read');
          socket.emit('chat:markRead', { chatId: route.params.chatId });
        }
      } else {
        console.error('Could not extract message text from incoming socket message:', data.message);
      }
    });
    
    socket.on('chat:typing', (data) => {
      console.log('Typing event received:', data);
      if (data.userType === 'user') {
        setUserTyping(data.isTyping);
      }
    });
    
    socket.on('chat:messagesRead', (data) => {
      console.log('Messages read event received:', data);
      // Update messages read status
      setMessages(prevMessages => 
        prevMessages.map(msg => 
          msg.senderType === 'astrologer' && !msg.read 
            ? { ...msg, read: true } 
            : msg
        )
      );
    });
    
    socket.on('chat:error', (error) => {
      console.error('Chat error from server:', error);
      Alert.alert('Chat Error', error.message || 'An error occurred with the chat connection');
    });
    
    return cleanup;
  };

  const ensureChatExists = async () => {
    try {
      // Check if we have a booking ID in state or route params
      const bookingIdToUse = currentBookingId || route.params?.bookingId;
      
      if (!bookingIdToUse) {
        console.error('No booking ID available');
        Alert.alert('Error', 'No booking ID available');
        return;
      }

      console.log(`Ensuring chat exists for booking ${bookingIdToUse}...`);
      
      // Get astrologer ID
      const astrologerId = await getAstrologerId();
      if (!astrologerId) {
        console.error('Could not get valid astrologer ID');
        Alert.alert('Error', 'Could not determine astrologer ID');
        return;
      }
      
      // Try to get existing chat
      let chatData = null;
      try {
        chatData = await chatService.getChatByBookingId(bookingIdToUse);
        if (chatData && chatData._id) {
          console.log(`Found existing chat: ${chatData._id}`);
          // Extract chat ID and update route params
          const extractedChatId = chatData._id;
          setCurrentChatId(extractedChatId);
          setCurrentBookingId(bookingIdToUse);
          navigation.setParams({ chatId: extractedChatId, bookingId: bookingIdToUse });
          
          // Set chat data and messages
          setChatData(chatData);
          setMessages(chatData.messages || []);
          
          // Mark messages as read using booking ID to avoid 404 errors
          // This is safer than using the chat ID which might lead to errors
          const markResult = await chatService.markMessagesAsRead(extractedChatId, bookingIdToUse);
          if (!markResult?.success && markResult?.error) {
            console.log(`Note when marking messages as read: ${markResult.error}`);
          }
          
          // Join chat room with both IDs
          await socketService.joinChatRoom(extractedChatId, bookingIdToUse);
          return;
        }
      } catch (error) {
        console.log('No existing chat found, will create new one');
      }
      
      // Get user ID from chat data or booking details
      let userId = null;
      if (chatData && chatData.user && chatData.user._id) {
        userId = chatData.user._id;
        console.log(`Using user ID from chat data: ${userId}`);
      } else {
        try {
          const bookingDetails = await chatService.getBookingDetails(bookingIdToUse);
          userId = bookingDetails.userId?._id || 
                   bookingDetails.userId || 
                   bookingDetails.user?._id || 
                   bookingDetails.user;
          if (userId) {
            console.log(`Using user ID from booking details: ${userId}`);
          }
        } catch (error) {
          console.error('Error getting user ID from booking details:', error);
        }
      }
      
      // Create new chat if we have user ID
      if (userId) {
        try {
          console.log(`Creating new chat for booking ${bookingIdToUse} with user ${userId}`);
          const newChat = await chatService.createChatForBooking(bookingIdToUse, userId);
          if (newChat && newChat._id) {
            console.log(`Created new chat: ${newChat._id}`);
            // Extract chat ID and update route params
            const extractedChatId = newChat._id;
            setCurrentChatId(extractedChatId);
            setCurrentBookingId(bookingIdToUse);
            navigation.setParams({ chatId: extractedChatId, bookingId: bookingIdToUse });
            
            // Set chat data and messages
            setChatData(newChat);
            setMessages(newChat.messages || []);
            
            // Wait a moment before trying to mark messages as read
            // This helps avoid race conditions with chat creation
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Join chat room with both IDs - use booking ID path for better compatibility
            await socketService.joinChatRoom(extractedChatId, bookingIdToUse);
            
            // Send initial message if no messages exist
            if (!newChat.messages || newChat.messages.length === 0) {
              await chatService.sendMessage(extractedChatId, 'Hello! How can I help you today?', 'text', bookingIdToUse);
            }
          } else {
            console.error('Created chat but no ID returned');
            Alert.alert('Error', 'Failed to create chat - no ID returned');
          }
        } catch (chatError) {
          console.error('Error creating chat:', chatError);
          Alert.alert('Error', 'Failed to create chat. Please try again.');
        }
      } else {
        console.error('Could not get user ID for creating chat');
        Alert.alert('Error', 'Could not create chat - missing user information');
      }
    } catch (error) {
      console.error('Error ensuring chat exists:', error);
      Alert.alert('Error', 'Failed to create or join chat');
    }
  };

  const loadChat = useCallback(async () => {
    try {
      setError(null);
      console.log(`Fetching messages for chat ${chatId}...`);
      
      // Check if we're using a booking ID instead of a chat ID
      const bookingIdToUse = currentBookingId || route.params?.bookingId;
      const isLikelyBookingId = bookingIdToUse && (bookingIdToUse === chatId || !chatId);
      
      if (isLikelyBookingId) {
        console.log(`ID ${chatId} appears to be a booking ID rather than a chat ID`);
        await ensureChatExists();
        setLoading(false);
        return;
      }
      
      // Try to get chat messages from API
      try {
        // Pass both chatId and bookingId to getChatMessages
        console.log(`Fetching messages with chatId: ${chatId}, bookingId: ${bookingIdToUse}`);
        const data = await chatService.getChatMessages(chatId, bookingIdToUse);
        
        // Check if we actually got messages or if it's an empty chat
        // Type guard to handle different response formats
        if (data && typeof data === 'object') {
          // Handle potential response formats
          if ('chat' in data && data.chat && typeof data.chat === 'object' && 'messages' in data.chat && Array.isArray(data.chat.messages)) {
            // Use proper type casting to prevent TypeScript errors
            const chatData = data.chat as unknown as ChatData;
            setChatData(chatData);
            setMessages(chatData.messages);
          } else if ('messages' in data && Array.isArray(data.messages)) {
            // Use proper type casting
            setChatData(data as unknown as ChatData);
            setMessages(data.messages as Message[]);
          } else if (Array.isArray(data)) {
            // If data is just an array of messages
            setMessages(data as Message[]);
          } else {
            console.log("Chat exists but has no messages");
            if ('_id' in data) {
              // It has required ChatData properties
              setChatData(data as unknown as ChatData);
            }
            setMessages([]);
          }
          
          // Mark messages as read - Pass both chatId and bookingId
          const markResult = await chatService.markMessagesAsRead(chatId, bookingIdToUse);
          if (!markResult?.success && markResult?.error) {
            console.log(`Note: ${markResult.error}`);
          }
          
          // Connect to socket
          await connectToSocket();
        } else {
          console.log("Chat exists but has no messages");
          setMessages([]);
          
          // Connect to socket
          await connectToSocket();
        }
      } catch (fetchErr) {
        console.error("Error fetching chat messages:", fetchErr);
        
        // If chat doesn't exist and we have a booking ID, try to create one
        if (bookingIdToUse) {
          console.log(`Chat ${chatId} not found, trying to create using booking ${bookingIdToUse}`);
          await ensureChatExists();
        } else {
          console.error("Chat not found and no booking ID available");
          setError("Chat not found. Please try again later.");
        }
      }
    } catch (err) {
      console.error('Error loading chat:', err);
      setError('Failed to load chat messages. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [chatId, currentBookingId, route.params?.bookingId, connectToSocket]);

  const handleSendMessage = async (messageText: string) => {
    if (!messageText.trim()) return;
    
    // Clear the input field immediately for better UX
    setMessage('');
    
    // Generate a unique ID for this message attempt
    const uniqueAttemptId = `${Date.now()}-${messageText.substring(0, 10)}`;
    
    // Check if we've already tried sending this message recently (debounce)
    if (sentMessages.current.has(uniqueAttemptId)) {
      console.log('Duplicate message send attempt detected and prevented');
      return;
    }
    
    // Add to sent messages cache
    sentMessages.current.add(uniqueAttemptId);
    
    // Clear old entries from the cache (prevent memory leaks)
    if (sentMessages.current.size > 20) {
      const values = Array.from(sentMessages.current.values());
      sentMessages.current.delete(values[0]);
    }
    
    try {
      setSending(true);
      
      // Generate a temporary ID for optimistic update
      const tempMsgId = uuidv4();
      
      // Create a temporary message to show immediately in the UI
      const tempMessage: Message = {
        _id: tempMsgId,
        message: messageText,
        timestamp: new Date(),
        senderType: 'astrologer',
        read: false,
        temporaryId: tempMsgId // Mark as temporary
      };
      
      // Add to messages list immediately (optimistic update)
      setMessages(prevMessages => [...prevMessages, tempMessage]);
      
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
      
      // Get current chat ID and booking ID
      const chatIdToUse = currentChatId || chatId;
      const bookingIdToUse = currentBookingId || route.params?.bookingId;
      
      if (!chatIdToUse && !bookingIdToUse) {
        console.error('No chat ID or booking ID available for sending message');
        Alert.alert('Error', 'Cannot send message: No chat or booking ID available');
        return;
      }
      
      console.log(`Sending message through API with chatId: ${chatIdToUse}, bookingId: ${bookingIdToUse}`);
      
      // Send message through API (always include bookingId when available)
      const response = await chatService.sendMessage(
        chatIdToUse || '', 
        messageText,
        'text',
        bookingIdToUse
      );
      
      // Update with the official message from the server
      if (response && response.data) {
        // Extract and format server response before updating the UI
        const responseData = response.data as any; // Use type assertion for flexibility
        
        const serverMessage: Message = {
          _id: responseData._id || responseData.id || tempMsgId,
          message: typeof responseData.message === 'string' ? responseData.message : 
                  (typeof responseData.content === 'string' ? responseData.content : 
                   messageText), // fallback to original text
          timestamp: responseData.timestamp || responseData.createdAt || new Date(),
          senderType: responseData.senderType || 'astrologer',
          read: responseData.read || false
        };
        
        // Replace temporary message with the actual one from the server
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            (msg.temporaryId === tempMsgId) ? serverMessage : msg
          )
        );
        
        console.log('Message sent successfully through API');
      } else {
        console.log('Message sent but no response data returned');
      }
      
      // If socket is not connected, try to connect
      if (!isConnected || !socketService.isSocketConnected()) {
        await connectToSocket();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Show error to user
      Alert.alert(
        'Message Failed',
        'Your message could not be sent. Please try again.',
        [{ text: 'OK' }]
      );
      
      // Remove the failed temporary message
      setMessages(prevMessages => 
        prevMessages.filter(msg => !msg.temporaryId)
      );
    } finally {
      setSending(false);
    }
  };

  // Handle typing indication
  const handleTyping = () => {
    // Don't send typing events if we're not connected
    if (!isConnected) return;
    
    // Get the current chat ID from route params
    const currentChatId = route.params.chatId;
    if (!currentChatId) return;
    
    // If we already have a timeout, clear it
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    // Get socket instance
    socketService.connectSocket().then(socket => {
      if (!socket) return;
      
      // Emit typing event
      socket.emit('chat:typing', {
        chatId: currentChatId,
        isTyping: true
      });
      
      // Set a timeout to stop typing after 2 seconds
      const timeout = setTimeout(() => {
        // Emit stop typing event
        socket?.emit('chat:typing', {
          chatId: currentChatId,
          isTyping: false
        });
      }, 2000);
      
      setTypingTimeout(timeout);
    });
  };

  const renderMessage = ({ item: msg }: { item: Message }) => {
    // Safely handle undefined values
    if (!msg) return null;
    
    const isAstrologer = msg.senderType === 'astrologer';
    const isSystem = msg.senderType === 'system';
    
    // Safely handle timestamp - ensure it's a valid Date object
    let timestamp: Date;
    try {
      if (msg.timestamp instanceof Date) {
        timestamp = msg.timestamp;
      } else if (typeof msg.timestamp === 'number') {
        timestamp = new Date(msg.timestamp);
      } else if (typeof msg.timestamp === 'string') {
        timestamp = new Date(msg.timestamp);
      } else {
        timestamp = new Date();
      }
    } catch (e) {
      timestamp = new Date();
    }
    
    return (
      <View style={[
        styles.messageContainer,
        isAstrologer ? styles.astrologerMessage : styles.userMessage,
        isSystem && styles.systemMessage
      ]}>
        <Text style={[
          styles.messageText,
          isAstrologer ? styles.astrologerMessageText : styles.userMessageText,
          isSystem && styles.systemMessageText
        ]}>
          {msg.message || ''}
        </Text>
        <View style={styles.messageFooter}>
          <Text style={[
            styles.timestamp,
            isAstrologer ? styles.astrologerTimestamp : styles.userTimestamp
          ]}>
            {formatDistanceToNow(timestamp, { addSuffix: true })}
          </Text>
          {isAstrologer && (
            <Ionicons 
              name={msg.read ? "checkmark-done" : "checkmark"} 
              size={16} 
              color={isAstrologer ? "#8e8e8e" : "#ffffff"} 
            />
          )}
        </View>
      </View>
    );
  };

  useEffect(() => {
    // Load chat data when component mounts
    loadChat();
    
    // Clean up socket on unmount
    return () => {
      // Don't disconnect the socket, just clean up listeners
      if (socketService.isSocketConnected()) {
        const socket = socketService.connectSocket().then(socket => {
          if (socket) {
            socket.off('chat:newMessage');
            socket.off('chat:typing');
            socket.off('chat:messagesRead');
            socket.off('chat:error');
          }
        });
      }
    };
  }, [loadChat]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    }, 100);
  }, [messages]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7854F7" />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#FF6B6B" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadChat}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{chatData?.user?.name || 'Chat'}</Text>
          <Text style={styles.headerSubtitle}>
            {userTyping ? 'typing...' : (isConnected ? 'online' : 'offline')}
          </Text>
        </View>
      </View>

      {/* Connection Status */}
      {isConnecting && (
        <View style={styles.connectionStatus}>
          <Text style={styles.connectionStatusText}>Connecting to chat...</Text>
        </View>
      )}

      {!isConnected && !isConnecting && (
        <TouchableOpacity style={styles.connectionError} onPress={connectToSocket}>
          <Text style={styles.connectionErrorText}>
            Disconnected from chat. Tap to reconnect.
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => {
          // Handle case where _id might be undefined or null
          if (!item || !item._id) {
            // Use temporaryId if available, otherwise use a timestamp-based fallback
            if (item.temporaryId) {
              return item.temporaryId;
            }
            
            // Create a fallback ID using timestamp if available
            let timestampValue = Date.now();
            if (item.timestamp) {
              if (item.timestamp instanceof Date) {
                timestampValue = item.timestamp.getTime();
              } else if (typeof item.timestamp === 'number') {
                timestampValue = item.timestamp;
              }
            }
            
            return `msg_${timestampValue}_${Math.random().toString(36).substring(2, 9)}`;
          }
          return item._id.toString();
        }}
        contentContainerStyle={styles.messagesList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet</Text>
          </View>
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {userTyping && (
        <View style={[styles.messageContainer, styles.userMessage, styles.typingIndicator]}>
          <View style={styles.typingDots}>
            <View style={styles.typingDot} />
            <View style={[styles.typingDot, styles.typingDotMiddle]} />
            <View style={styles.typingDot} />
          </View>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={message}
          onChangeText={(text) => {
            setMessage(text);
            handleTyping();
          }}
          multiline
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!message.trim() || sending) && styles.sendButtonDisabled
          ]}
          onPress={() => handleSendMessage(message)}
          disabled={!message.trim() || sending || !isConnected}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  headerInfo: {
    marginLeft: 16,
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  connectionStatus: {
    backgroundColor: '#FFEDBA',
    padding: 8,
    alignItems: 'center',
  },
  connectionStatusText: {
    color: '#8B6800',
    fontSize: 14,
  },
  connectionError: {
    backgroundColor: '#FFBABA',
    padding: 8,
    alignItems: 'center',
  },
  connectionErrorText: {
    color: '#D8000C',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#7854F7',
    borderRadius: 4,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  userMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 0,
  },
  astrologerMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#7854F7',
    borderBottomRightRadius: 0,
  },
  systemMessage: {
    alignSelf: 'center',
    backgroundColor: '#E5E5E5',
    maxWidth: '90%',
  },
  messageText: {
    fontSize: 16,
  },
  userMessageText: {
    color: '#333',
  },
  astrologerMessageText: {
    color: '#fff',
  },
  systemMessageText: {
    color: '#666',
    fontStyle: 'italic',
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
  },
  timestamp: {
    fontSize: 12,
    marginRight: 4,
  },
  userTimestamp: {
    color: '#999',
  },
  astrologerTimestamp: {
    color: '#E0CFFF',
  },
  typingIndicator: {
    padding: 8,
    maxWidth: '40%',
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 20,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#666',
    marginHorizontal: 2,
  },
  typingDotMiddle: {
    marginTop: -5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    padding: 12,
    paddingTop: 12,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7854F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    alignSelf: 'flex-end',
  },
  sendButtonDisabled: {
    backgroundColor: '#BBBBBB',
  },
});

export default ChatScreen; 