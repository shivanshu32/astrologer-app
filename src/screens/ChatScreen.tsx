import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
  Image,
  Dimensions,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal,
  Linking,
  Animated,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import * as socketService from '../services/socketService';
import * as chatService from '../services/chatService';
import { Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { Audio } from 'expo-av';
// import NetInfo from '@react-native-community/netinfo';
import { checkNetworkConnectivity, enhancedJoinChatRoom, isSocketInRoom, getSocket } from '../services/socketService';

// Message interface
interface Message {
  _id?: string;
  id?: string;
  message: string;
  content?: string;
  timestamp: Date | string | number;
  createdAt?: Date | string | number;
  senderType: 'user' | 'astrologer' | 'system';
  read?: boolean;
  sender?: string;
  status?: string;
  senderId?: string;
  receiverId?: string;
  messageType?: string;
  temporaryId?: string;
}

// Chat data interface
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
  
  if (data._id) return String(data._id);
  if (data.chatId) return String(data.chatId);
  if (data.data?._id) return String(data.data._id);
  if (data.data?.chatId) return String(data.data.chatId);
  
  return null;
};

const ChatScreen = () => {
  const route = useRoute();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Define types for route params
  interface ChatRouteParams {
    chatId?: string;
    bookingId?: string;
  }
  
  // Extract params with type safety
  const params = route.params as ChatRouteParams || {};
  const chatId = params.chatId;
  const bookingId = params.bookingId;
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
  const socketRef = useRef<Socket | null>(null);
  
  // Handle sending messages
  const handleSendMessage = async () => {
    if (!message.trim() || sending || !currentChatId) {
      return;
    }
    
    try {
      setSending(true);
      
      // Create a temporary message to show immediately in the UI
      const tempMessage: Message = {
        _id: `temp-${Date.now()}`,
        message: message.trim(),
        content: message.trim(),
        timestamp: new Date(),
        senderType: 'astrologer',
        read: false,
        temporaryId: `temp-${Date.now()}`
      };
      
      // Add to messages array immediately for UI feedback
      setMessages(prevMessages => [...prevMessages, tempMessage]);
      
      // Clear the input
      setMessage('');
      
      // Send via socket if connected
      if (socketRef.current?.connected) {
        socketRef.current.emit('chat:sendMessage', {
          chatId: currentChatId,
          bookingId: currentBookingId,
          message: tempMessage.message,
          senderType: 'astrologer'
        });
      }
      
      // Also send via API as backup
      try {
        const response = await chatService.chatService.sendMessage(
          currentChatId,
          tempMessage.message,
          'text',  // messageType
          currentBookingId || undefined
        );
        
        console.log('Message sent via API:', response);
      } catch (apiError) {
        console.error('Failed to send message via API:', apiError);
        // We don't show an error here since the socket might have worked
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };
  
  // Load messages from the server - declaration moved up for reference in performBackgroundRetries
  const loadMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if we have a valid chat ID or booking ID
      if (!currentChatId && !currentBookingId) {
        setError('No chat ID or booking ID available');
        setLoading(false);
        return;
      }
      
      // Fetch messages using the current chat ID and booking ID
      console.log(`Loading messages for chat ID: ${currentChatId}, booking ID: ${currentBookingId}`);
      
      let chatResponse;
      try {
        if (currentChatId) {
          console.log('Fetching chat by chat ID:', currentChatId);
          chatResponse = await chatService.chatService.getChatById(currentChatId);
        } else if (currentBookingId) {
          console.log('Fetching chat by booking ID:', currentBookingId);
          chatResponse = await chatService.chatService.getChatByBookingId(currentBookingId);
        }
        
        if (chatResponse) {
          console.log('Chat response:', chatResponse);
          const chatData = chatResponse.data || chatResponse;
          setChatData(chatData);
          setMessages(chatData.messages || []);
          
          // Mark messages as read
          if (currentChatId) {
            try {
              await chatService.chatService.markMessagesAsRead(currentChatId, currentBookingId || '');
            } catch (markReadError) {
              console.error('Error marking messages as read:', markReadError);
            }
          }
        } else {
          console.warn('No chat data returned from server');
        }
      } catch (fetchError) {
        console.error('Error fetching chat:', fetchError);
        setError(`Failed to fetch chat: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Failed to load messages. Please try again.');
      setLoading(false);
    }
  };
  
  // Helper function to perform background retries for chat room joining
  const performBackgroundRetries = (chatId: string, bookingId: string) => {
    // More aggressive retry strategy with increasing delays
    [2000, 5000, 10000, 20000].forEach((delay, index) => {
      setTimeout(() => {
        console.log(`Background retry ${index + 1} for chat room join...`);
        // First ensure the socket is connected
        socketService.connectSocket()
          .then(() => {
            console.log(`Socket connected for background retry ${index + 1}`);
            // Then try to join the room
            return socketService.enhancedJoinChatRoom(chatId || '', bookingId || '', {
              timeout: 15000, // Longer timeout for background retries
              retryCount: 2,  // More retries per attempt
              onProgress: (status) => console.log(`Background retry ${index + 1} progress: ${status}`)
            });
          })
          .then(retryResult => {
            console.log(`Background retry ${index + 1} result:`, retryResult);
            if (retryResult.success) {
              // Update connection status
              socketConnected.current = true;
              setIsConnected(true);
              setHasJoinedRoom(true);
              setIsSocketReady(true);
              // Update UI to show we're connected
              console.log('Background retry successful, updating UI states');
              // Refresh messages to ensure we have the latest
              loadMessages();
            } else {
              // Still update the socket ready state based on current connection
              setIsSocketReady(socketService.isSocketConnected());
            }
          })
          .catch(error => {
            console.error(`Background retry ${index + 1} failed:`, error);
            // Update socket status based on current connection
            setIsSocketReady(socketService.isSocketConnected());
            
            // If this is the last retry, update the error message
            if (index === 3) { // Last retry in our array [2000, 5000, 10000, 20000]
              let errorMessage = `All background retries failed`;
              if (error instanceof Error) {
                errorMessage += `: ${error.message}`;
              }
              
              // Check network status
              checkNetworkConnectivity().then(isConnected => {
                if (!isConnected) {
                  setNetworkStatus(false);
                  errorMessage += ' - Network connection issue detected';
                }
                setError(errorMessage);
                
                // Log diagnostic information
                console.log('Final connection diagnostic after all retries:', {
                  socketConnected: socketService.isSocketConnected(),
                  networkStatus: isConnected,
                  chatId,
                  bookingId
                });
              });
            }
          });
      }, delay);
    });
  };
  const [userId, setUserId] = useState<string | null>(null);
  const [astrologerId, setAstrologerId] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
  const [networkStatus, setNetworkStatus] = useState<boolean>(true);
  const [messageInput, setMessageInput] = useState<TextInput | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const [retryingMessages, setRetryingMessages] = useState<{[key: string]: boolean}>({});
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState<number>(0);
  const [notificationSound, setNotificationSound] = useState<Audio.Sound | null>(null);
  const [typingIndicatorVisible, setTypingIndicatorVisible] = useState(false);
  const typingIndicatorTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedInitialMessages, setHasLoadedInitialMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [page, setPage] = useState(1);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectInterval = useRef<NodeJS.Timeout | null>(null);
  const [showConnectionStatus, setShowConnectionStatus] = useState(false);
  const connectionStatusTimeout = useRef<NodeJS.Timeout | null>(null);
  const [connectionStatusMessage, setConnectionStatusMessage] = useState('');
  const [connectionStatusType, setConnectionStatusType] = useState<'error' | 'success' | 'warning'>('warning');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // Removed redundant state variables
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [messagesMap, setMessagesMap] = useState<{[key: string]: Message}>({});
  const [messageQueue, setMessageQueue] = useState<Message[]>([]);
  const messageQueueProcessing = useRef(false);
  const [isSocketReady, setIsSocketReady] = useState(false);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [socketConnectionAttempts, setSocketConnectionAttempts] = useState(0);
  const [lastSocketConnectionAttempt, setLastSocketConnectionAttempt] = useState(0);
  const [socketConnectionStatus, setSocketConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [diagnosticInfo, setDiagnosticInfo] = useState<{[key: string]: any}>({});
  const [showDiagnostics, setShowDiagnostics] = useState(true); // Enable diagnostics by default
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasAttemptedJoin, setHasAttemptedJoin] = useState(false);
  const [joinAttempts, setJoinAttempts] = useState(0);
  const [lastStatusCheck, setLastStatusCheck] = useState(0); // Add lastStatusCheck state
  const [lastJoinAttempt, setLastJoinAttempt] = useState(0);
  const [joinStatus, setJoinStatus] = useState<'none' | 'joining' | 'joined' | 'failed'>('none');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinMethod, setJoinMethod] = useState<'both' | 'chatOnly' | 'bookingOnly' | 'none'>('none');
  const [joinResult, setJoinResult] = useState<{success: boolean, error?: string} | null>(null);
  const [joinDuration, setJoinDuration] = useState(0);
  const [joinStartTime, setJoinStartTime] = useState(0);
  const [joinEndTime, setJoinEndTime] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [hasTriedBothIds, setHasTriedBothIds] = useState(false);
  const [hasTriedChatIdOnly, setHasTriedChatIdOnly] = useState(false);
  const [hasTriedBookingIdOnly, setHasTriedBookingIdOnly] = useState(false);
  const [joinRetryCount, setJoinRetryCount] = useState(0);
  const [joinRetryDelay, setJoinRetryDelay] = useState(2000);
  const [joinRetryTimeout, setJoinRetryTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isRetryingJoin, setIsRetryingJoin] = useState(false);
  const [retryJoinMethod, setRetryJoinMethod] = useState<'both' | 'chatOnly' | 'bookingOnly' | 'none'>('none');
  const [retryJoinResult, setRetryJoinResult] = useState<{success: boolean, error?: string} | null>(null);
  const [retryJoinDuration, setRetryJoinDuration] = useState(0);
  const [retryJoinStartTime, setRetryJoinStartTime] = useState(0);
  const [retryJoinEndTime, setRetryJoinEndTime] = useState(0);
  const [isRetryJoining, setIsRetryJoining] = useState(false);
  const [hasTriedRetryBothIds, setHasTriedRetryBothIds] = useState(false);
  const [hasTriedRetryChatIdOnly, setHasTriedRetryChatIdOnly] = useState(false);
  const [hasTriedRetryBookingIdOnly, setHasTriedRetryBookingIdOnly] = useState(false);
  const [retryJoinRetryCount, setRetryJoinRetryCount] = useState(0);
  const [retryJoinRetryDelay, setRetryJoinRetryDelay] = useState(2000);
  const [retryJoinRetryTimeout, setRetryJoinRetryTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isRetryingRetryJoin, setIsRetryingRetryJoin] = useState(false);
  const [retryRetryJoinMethod, setRetryRetryJoinMethod] = useState<'both' | 'chatOnly' | 'bookingOnly' | 'none'>('none');
  const [retryRetryJoinResult, setRetryRetryJoinResult] = useState<{success: boolean, error?: string} | null>(null);
  const [retryRetryJoinDuration, setRetryRetryJoinDuration] = useState(0);
  const [retryRetryJoinStartTime, setRetryRetryJoinStartTime] = useState(0);
  const [retryRetryJoinEndTime, setRetryRetryJoinEndTime] = useState(0);
  const [isRetryRetryJoining, setIsRetryRetryJoining] = useState(false);
  const [hasTriedRetryRetryBothIds, setHasTriedRetryRetryBothIds] = useState(false);
  const [hasTriedRetryRetryChatIdOnly, setHasTriedRetryRetryChatIdOnly] = useState(false);
  const [hasTriedRetryRetryBookingIdOnly, setHasTriedRetryRetryBookingIdOnly] = useState(false);
  const [retryRetryJoinRetryCount, setRetryRetryJoinRetryCount] = useState(0);
  const [retryRetryJoinRetryDelay, setRetryRetryJoinRetryDelay] = useState(2000);
  const [retryRetryJoinRetryTimeout, setRetryRetryJoinRetryTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isRetryingRetryRetryJoin, setIsRetryingRetryRetryJoin] = useState(false);
  const [retryRetryRetryJoinMethod, setRetryRetryRetryJoinMethod] = useState<'both' | 'chatOnly' | 'bookingOnly' | 'none'>('none');
  const [retryRetryRetryJoinResult, setRetryRetryRetryJoinResult] = useState<{success: boolean, error?: string} | null>(null);
  const [retryRetryRetryJoinDuration, setRetryRetryRetryJoinDuration] = useState(0);
  const [retryRetryRetryJoinStartTime, setRetryRetryRetryJoinStartTime] = useState(0);
  const [retryRetryRetryJoinEndTime, setRetryRetryRetryJoinEndTime] = useState(0);
  const [isRetryRetryRetryJoining, setIsRetryRetryRetryJoining] = useState(false);
  const [hasTriedRetryRetryRetryBothIds, setHasTriedRetryRetryRetryBothIds] = useState(false);
  const [hasTriedRetryRetryRetryChatIdOnly, setHasTriedRetryRetryRetryChatIdOnly] = useState(false);
  const [hasTriedRetryRetryRetryBookingIdOnly, setHasTriedRetryRetryRetryBookingIdOnly] = useState(false);
  const [retryRetryRetryJoinRetryCount, setRetryRetryRetryJoinRetryCount] = useState(0);
  const [retryRetryRetryJoinRetryDelay, setRetryRetryRetryJoinRetryDelay] = useState(2000);
  const [retryRetryRetryJoinRetryTimeout, setRetryRetryRetryJoinRetryTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isRetryingRetryRetryRetryJoin, setIsRetryingRetryRetryRetryJoin] = useState(false);
  const [retryRetryRetryRetryJoinMethod, setRetryRetryRetryRetryJoinMethod] = useState<'both' | 'chatOnly' | 'bookingOnly' | 'none'>('none');
  const [retryRetryRetryRetryJoinResult, setRetryRetryRetryRetryJoinResult] = useState<{success: boolean, error?: string} | null>(null);
  const [retryRetryRetryRetryJoinDuration, setRetryRetryRetryRetryJoinDuration] = useState(0);
  const [retryRetryRetryRetryJoinStartTime, setRetryRetryRetryRetryJoinStartTime] = useState(0);
  const [retryRetryRetryRetryJoinEndTime, setRetryRetryRetryRetryJoinEndTime] = useState(0);

  // Initialize chat function
  const initializeChat = async () => {
    try {
      setLoading(true);
      setError(null);
      setIsInitialLoad(true);
      
      // Check if we have a valid chat ID or booking ID
      if (!chatId && !bookingId) {
        setError('No chat ID or booking ID provided');
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }
      
      console.log(`Initializing chat with chatId: ${chatId}, bookingId: ${bookingId}`);
      
      // Try to fetch existing chat
      let chatResponse;
      try {
        if (chatId) {
          console.log('Fetching chat by chat ID:', chatId);
          chatResponse = await chatService.chatService.getChatById(chatId);
        } else if (bookingId) {
          console.log('Fetching chat by booking ID:', bookingId);
          chatResponse = await chatService.chatService.getChatByBookingId(bookingId);
        }
        
        console.log('Chat response:', chatResponse);
      } catch (fetchError) {
        console.error('Error fetching chat:', fetchError);
        chatResponse = null;
      }
      
      // If we couldn't get an existing chat and we have a booking ID, create a new one
      if (!chatResponse && bookingId) {
        try {
          console.log('Creating new chat with booking ID:', bookingId);
          chatResponse = await chatService.chatService.createOrGetChat(bookingId);
          console.log('New chat created:', chatResponse);
        } catch (createError) {
          console.error('Error creating new chat:', createError);
          setError(`Failed to create chat: ${createError instanceof Error ? createError.message : String(createError)}`);
          setLoading(false);
          setIsInitialLoad(false);
          return;
        }
      }
      
      // If we still don't have a chat response, show error
      if (!chatResponse) {
        setError('Failed to fetch or create chat');
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }
      
      // Extract chat ID from response
      const extractedChatId = extractChatId(chatResponse);
      console.log('Extracted chat ID:', extractedChatId);
      
      if (!extractedChatId) {
        setError('Could not extract chat ID from response');
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }
      
      // Set chat and booking IDs
      setCurrentChatId(extractedChatId);
      
      // Set booking ID if available
      if (bookingId) {
        setCurrentBookingId(bookingId);
      } else if (chatResponse.data?.booking?._id) {
        const bookingIdFromResponse = chatResponse.data.booking._id;
        setCurrentBookingId(bookingIdFromResponse);
      }
      
      // Extract chat data and set messages
      const chatData = chatResponse.data || chatResponse;
      setChatData(chatData);
      setMessages(chatData.messages || []);
      
      // Mark messages as read
      try {
        await chatService.chatService.markMessagesAsRead(extractedChatId, bookingId || '');
      } catch (markReadError) {
        console.error('Error marking messages as read:', markReadError);
      }
      
      // Connect to socket and join room
      try {
        console.log('Connecting to socket...');
        setIsConnecting(true);
        setSocketConnectionStatus('connecting');
        
        const socketInstance = await socketService.connectSocket();
        setSocketInstance(socketInstance);
        
        if (!socketInstance || !socketInstance.connected) {
          console.warn('Socket connection failed on first attempt, retrying...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          const retrySocketInstance = await socketService.connectSocket();
          setSocketInstance(retrySocketInstance);
        }
        
        setIsConnected(!!socketInstance?.connected);
        setSocketConnectionStatus(socketInstance?.connected ? 'connected' : 'disconnected');
        setIsSocketReady(true);
        
        // Try to join the room
        console.log('Attempting to join room...');
        tryJoinRoom();
      } catch (socketError) {
        console.error('Socket connection error:', socketError);
        setError(`Socket connection error: ${socketError instanceof Error ? socketError.message : String(socketError)}`);
        setIsConnecting(false);
        setSocketConnectionStatus('disconnected');
        
        // Start background retries for room joining
        if (extractedChatId) {
          performBackgroundRetries(extractedChatId, bookingId || '');
        }
      }
      
      // Finish loading
      setLoading(false);
      setIsInitialLoad(false);
    } catch (error) {
      console.error('Error in initializeChat:', error);
      setError(`Error initializing chat: ${error instanceof Error ? error.message : String(error)}`);
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  // Function to check if socket is in the room and update diagnostic info
  const checkSocketRoomStatus = async () => {
    const socket = socketService.getSocket();
    if (!socket || !currentChatId) return false;
    
    try {
      const inRoom = await socketService.isSocketInRoom(currentChatId);
      setHasJoinedRoom(inRoom);
      
      // Update diagnostic info
      setDiagnosticInfo(prev => ({
        ...prev,
        inRoom,
        lastRoomCheckTime: new Date().toLocaleTimeString()
      }));
      
      return inRoom;
    } catch (error) {
      console.error('Error checking if socket is in room:', error);
      setDiagnosticInfo(prev => ({
        ...prev,
        inRoom: false,
        lastRoomCheckError: error instanceof Error ? error.message : String(error)
      }));
      return false;
    }
  };
  
  // Function to try joining a chat room
  const tryJoinRoom = async () => {
    try {
      if (!currentChatId && !currentBookingId) {
        console.log('Cannot join room: no chat ID or booking ID available');
        return;
      }
      
      // Update state to indicate we're joining
      setIsJoining(true);
      setJoinStatus('joining');
      setJoinError(null);
      
      // Update diagnostic info
      setDiagnosticInfo(prev => ({
        ...prev,
        joinAttemptTime: new Date().toLocaleTimeString(),
        joinAttemptCount: (prev.joinAttemptCount || 0) + 1
      }));
      
      // Try to join the room using the enhanced function
      console.log(`Attempting to join room with chatId: ${currentChatId}, bookingId: ${currentBookingId}`);
      setLastJoinAttempt(Date.now());
      
      // Update diagnostic info
      setDiagnosticInfo(prev => ({
        ...prev,
        joinAttemptTime: new Date().toLocaleTimeString(),
        joinMethod: currentChatId && currentBookingId ? 'both' : currentChatId ? 'chatOnly' : 'bookingOnly',
        chatId: currentChatId,
        bookingId: currentBookingId
      }));
      
      // Call the enhanced join function with progress reporting
      const result = await socketService.enhancedJoinChatRoom(currentChatId || '', currentBookingId || '', {
        timeout: 10000,
        retryCount: 3,
        onProgress: (status) => {
          console.log(`Join progress: ${status}`);
          // Update diagnostic info
          setDiagnosticInfo(prev => ({
            ...prev,
            joinProgressStatus: status,
            joinProgressTime: new Date().toLocaleTimeString()
          }));
        }
      });
      
      // Handle the result
      if (result.success) {
        setHasJoinedRoom(true);
        setJoinStatus('joined');
        setJoinError(null);
        setIsJoining(false);
        // Update diagnostic info
        setDiagnosticInfo(prev => ({
          ...prev,
          joinSuccess: true,
          joinSuccessTime: new Date().toLocaleTimeString(),
          joinRoomId: currentChatId || ''
        }));
      } else {
        setHasJoinedRoom(false);
        setJoinStatus('failed');
        setJoinError(result.error || 'Failed to join room');
        setIsJoining(false);
        // Update diagnostic info
        setDiagnosticInfo(prev => ({
          ...prev,
          joinSuccess: false,
          joinFailTime: new Date().toLocaleTimeString(),
          joinFailError: result.error
        }));
      }
    } catch (error) {
      console.error('Error joining room:', error);
      setHasJoinedRoom(false);
      setJoinStatus('failed');
      setJoinError(error instanceof Error ? error.message : String(error));
      setIsJoining(false);
      // Update diagnostic info
      setDiagnosticInfo(prev => ({
        ...prev,
        joinSuccess: false,
        joinFailTime: new Date().toLocaleTimeString(),
        joinFailError: error instanceof Error ? error.message : String(error)
      }));
    }
  };

  // Periodic check for network and socket status
  useEffect(() => {
    // Only start checking if we have a chat ID or booking ID
    if (!currentChatId && !currentBookingId) return;
    
    console.log('Setting up periodic status check...');
    
    const statusCheckInterval = setInterval(async () => {
      // Update last status check time
      setLastStatusCheck(Date.now());
      
      // Check network connectivity
      const isNetworkConnected = await checkNetworkConnectivity();
      setNetworkStatus(isNetworkConnected);
      
      // Update diagnostic info
      setDiagnosticInfo(prev => ({
        ...prev,
        networkConnected: isNetworkConnected,
        lastNetworkCheckTime: new Date().toLocaleTimeString()
      }));
      
      // If network is connected, check socket room status
      if (isNetworkConnected) {
        const inRoom = await checkSocketRoomStatus();
        
        // If we're online but not in the room, try to join again
        if (!inRoom && joinStatus !== 'joining') {
          console.log('Network is online but not in room, attempting to join...');
          tryJoinRoom();
        }
      }
    }, 10000); // Check every 10 seconds
    
    return () => {
      clearInterval(statusCheckInterval);
    };
  }, [currentChatId, currentBookingId, joinStatus]);

  // Call initializeChat when the component mounts and set up socket listeners
  useEffect(() => {
    console.log('ChatScreen mounted, initializing chat...');
    // Set the timestamp for the first connection attempt
    setLastSocketConnectionAttempt(Date.now());
    // Increment join attempts counter
    setJoinAttempts(prev => prev + 1);
    // Update connection status
    setSocketConnectionStatus('connecting');
    
    console.log('Current route params:', route.params);
    console.log('chatId:', chatId, 'bookingId:', bookingId);
    console.log('Current loading state:', loading);
    console.log('Current error state:', error);
    
    // Set IDs for use in the component
    // Removed redundant state updates
    
    // Add a small delay before initializing to ensure all state is properly set
    setTimeout(() => {
      console.log('Starting chat initialization...');
      initializeChat();
    }, 500);
    
    // Set up socket connection status listeners
    const socket = getSocket();
    if (socket) {
      console.log('Setting up socket event listeners');
      
      socket.on('connect', () => {
        console.log('Socket connected event received');
        setIsConnected(true);
        setIsSocketReady(true);
        setSocketConnectionStatus('connected');
        // Update diagnostic info
        setDiagnosticInfo(prev => ({
          ...prev,
          socketConnected: true,
          lastConnectedTime: new Date().toLocaleTimeString()
        }));
        
        // When connected, try to join the room if we have a chat ID
        if (currentChatId || currentBookingId) {
          tryJoinRoom();
        }
      });
      
      socket.on('disconnect', () => {
        console.log('Socket disconnected event received');
        setIsConnected(false);
        setIsSocketReady(false);
        setSocketConnectionStatus('disconnected');
        setHasJoinedRoom(false);
        // Update diagnostic info
        setDiagnosticInfo(prev => ({
          ...prev,
          socketConnected: false,
          lastDisconnectTime: new Date().toLocaleTimeString(),
          disconnectCount: (prev.disconnectCount || 0) + 1
        }));
      });
      
      socket.on('connect_error', (error: Error) => {
        console.error('Socket connection error:', error);
        setIsConnected(false);
        setIsSocketReady(false);
        setSocketConnectionStatus('disconnected');
        setError(`Socket connection error: ${error.message}`);
        // Update diagnostic info
        setDiagnosticInfo(prev => ({
          ...prev,
          socketConnected: false,
          lastErrorTime: new Date().toLocaleTimeString(),
          lastErrorMessage: error.message,
          errorCount: (prev.errorCount || 0) + 1
        }));
      });
      
      // Listen for new messages
      socket.on('new_message', (message: Message) => {
        console.log('New message received:', message);
        // Add the new message to our messages array
        setMessages(prevMessages => [...prevMessages, message]);
      });
    }
    
    return () => {
      // Clean up socket event listeners and other resources here
      console.log('ChatScreen unmounted, cleaning up...');
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
        socket.off('new_message');
      }
    };
  }, [chatId, bookingId]); // Re-initialize if chatId or bookingId changes
  
  // Define styles for the component
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#f5f5f5',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#ddd',
      backgroundColor: '#fff',
    },
    backButton: {
      padding: 10,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginLeft: 10,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorText: {
      color: 'red',
      marginBottom: 10,
      textAlign: 'center',
    },
    retryButton: {
      padding: 10,
      backgroundColor: '#ddd',
      borderRadius: 5,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    messageContainer: {
      padding: 10,
      marginVertical: 5,
      marginHorizontal: 10,
      borderRadius: 10,
      maxWidth: '80%',
    },
    sentMessage: {
      alignSelf: 'flex-end',
      backgroundColor: '#dcf8c6',
    },
    receivedMessage: {
      alignSelf: 'flex-start',
      backgroundColor: '#fff',
    },
    messageText: {
      fontSize: 16,
    },
    timestamp: {
      fontSize: 12,
      color: '#999',
      alignSelf: 'flex-end',
      marginTop: 5,
    },
    inputContainer: {
      flexDirection: 'row',
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: '#ddd',
      backgroundColor: '#f5f5f5',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      padding: 12,
      paddingHorizontal: 15,
      borderWidth: 1,
      borderColor: '#ddd',
      borderRadius: 20,
      marginRight: 10,
      backgroundColor: '#fff',
      fontSize: 16,
    },
    sendButton: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#0084ff',
      width: 60,
      height: 44,
      borderRadius: 22,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 1.5,
    },
    sendButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 15,
    },
  });

  // Debug render function to help diagnose the blank screen issue
  console.log('Rendering ChatScreen with state:', {
    loading,
    error,
    chatData,
    messages: messages.length,
    currentChatId,
    currentBookingId,
    hasJoinedRoom
  });

  // Render the chat screen
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {chatData?.user?.name || 'Chat'}
        </Text>
      </View>

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text>Loading chat...</Text>
        </View>
      )}

      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={initializeChat} style={styles.retryButton}>
            <Text>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chat messages */}
      {!loading && !error && messages.length > 0 && (
        <FlatList
          data={messages}
          keyExtractor={(item) => item._id || item.temporaryId || String(item.timestamp)}
          renderItem={({ item }) => (
            <View style={[styles.messageContainer, 
              item.senderType === 'astrologer' ? styles.sentMessage : styles.receivedMessage
            ]}>
              <Text style={styles.messageText}>{item.content}</Text>
              <Text style={styles.timestamp}>
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          )}
          inverted
        />
      )}

      {/* Empty state */}
      {!loading && !error && messages.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text>No messages yet. Start the conversation!</Text>
        </View>
      )}

      {/* Message input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={styles.inputContainer}
      >
        <TextInput
          placeholder="Type a message..."
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          onSubmitEditing={handleSendMessage}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline={false}
          autoFocus={false}
          autoCorrect={true}
          autoCapitalize="sentences"
        />
        <TouchableOpacity 
          style={styles.sendButton}
          onPress={handleSendMessage}
          disabled={!message.trim() || sending}
        >
          <Text style={styles.sendButtonText}>{sending ? 'Sending...' : 'Send'}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* Debug info */}
      <View style={{ position: 'absolute', bottom: 100, right: 10, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 5, display: showDiagnostics ? 'flex' : 'none' }}>
        <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>CHAT DIAGNOSTICS</Text>
        <Text style={{ color: 'white', fontSize: 10 }}>
          Chat ID: <Text style={{color: currentChatId ? '#90EE90' : '#FF6347'}}>{currentChatId || 'None'}</Text>{"\n"}
          Booking ID: <Text style={{color: currentBookingId ? '#90EE90' : '#FF6347'}}>{currentBookingId || 'None'}</Text>{"\n"}
          Joined Room: <Text style={{color: hasJoinedRoom ? '#90EE90' : '#FF6347'}}>{hasJoinedRoom ? 'Yes' : 'No'}</Text>{"\n"}
          Socket Ready: <Text style={{color: isSocketReady ? '#90EE90' : '#FF6347'}}>{isSocketReady ? 'Yes' : 'No'}</Text>{"\n"}
          Socket Connected: <Text style={{color: isConnected ? '#90EE90' : '#FF6347'}}>{isConnected ? 'Yes' : 'No'}</Text>{"\n"}
          Connecting: <Text style={{color: isConnecting ? '#FFA500' : '#90EE90'}}>{isConnecting ? 'Yes' : 'No'}</Text>{"\n"}
          Network Status: <Text style={{color: networkStatus ? '#90EE90' : '#FF6347'}}>{networkStatus ? 'Online' : 'Offline'}</Text>{"\n"}
          Messages: <Text style={{color: messages.length > 0 ? '#90EE90' : '#FFA500'}}>{messages.length}</Text>{"\n"}
          Join Attempts: <Text style={{color: joinAttempts > 3 ? '#FF6347' : '#90EE90'}}>{joinAttempts}</Text>{"\n"}
          Last Attempt: <Text style={{color: '#FFA500'}}>{lastSocketConnectionAttempt ? new Date(lastSocketConnectionAttempt).toLocaleTimeString() : 'None'}</Text>{"\n"}
          Socket Status: <Text style={{color: socketConnectionStatus === 'connected' ? '#90EE90' : (socketConnectionStatus === 'connecting' ? '#FFA500' : '#FF6347')}}>{socketConnectionStatus}</Text>{"\n"}
          Last Error: <Text style={{color: error ? '#FF6347' : '#90EE90'}}>{error || 'None'}</Text>
        </Text>
        
        {/* Additional diagnostic info */}
        <View style={{marginTop: 10, borderTopWidth: 1, borderTopColor: '#555', paddingTop: 5}}>
          <Text style={{ color: 'white', fontSize: 9, fontWeight: 'bold' }}>DETAILED DIAGNOSTICS:</Text>
          <Text style={{ color: '#AAA', fontSize: 9 }}>
            Last Connected: {diagnosticInfo.lastConnectedTime || 'Never'}{"\n"}
            Last Disconnected: {diagnosticInfo.lastDisconnectTime || 'Never'}{"\n"}
            Disconnect Count: {diagnosticInfo.disconnectCount || 0}{"\n"}
            Error Count: {diagnosticInfo.errorCount || 0}{"\n"}
            Last Error: {diagnosticInfo.lastErrorMessage || 'None'}
          </Text>
        </View>
        <TouchableOpacity 
          style={{marginTop: 10, backgroundColor: '#4169E1', padding: 5, borderRadius: 3}}
          onPress={() => {
            // Force reconnect and rejoin
            console.log('Manual reconnect triggered from debug panel');
            socketService.connectSocket().then(() => {
              performBackgroundRetries(currentChatId || '', currentBookingId || '');
            });
          }}
        >
          <Text style={{color: 'white', fontSize: 10, textAlign: 'center'}}>Force Reconnect</Text>
        </TouchableOpacity>
      </View>
      
      {/* Debug toggle button */}
      <TouchableOpacity 
        style={{ 
          position: 'absolute', 
          bottom: 70, 
          right: 10, 
          backgroundColor: showDiagnostics ? '#4169E1' : '#333', 
          padding: 8, 
          borderRadius: 5,
          borderWidth: 1,
          borderColor: 'white'
        }}
        onPress={() => setShowDiagnostics(!showDiagnostics)}
      >
        <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
          {showDiagnostics ? 'Hide Debug' : 'Show Debug'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

export default ChatScreen;
