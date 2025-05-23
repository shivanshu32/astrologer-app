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
import NetInfo from '@react-native-community/netinfo';
import { checkNetworkConnectivity } from '../services/socketService';

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
  
  /**
   * Enhanced function to join a chat room with better error handling and retry mechanism
   */
  const joinChatRoomEnhanced = async (chatId: string, bookingId: string): Promise<boolean> => {
    try {
      console.log(`Attempting enhanced join with chatId: ${chatId}, bookingId: ${bookingId}`);
      
      // Show loading indicator
      setLoading(true);
      
      // Use the enhanced join function with progress reporting
      const joinResult = await socketService.enhancedJoinChatRoom(
        chatId, 
        bookingId,
        {
          timeout: 8000, // 8 second timeout for UI responsiveness
          retryCount: 2,  // Try twice within the timeout
          onProgress: (status: string) => {
            console.log(`Chat join progress: ${status}`);
          }
        }
      );
      
      // Hide loading indicator
      setLoading(false);
      
      if (joinResult.success) {
        console.log('Successfully joined chat room');
        return true;
      } else {
        console.warn('Chat room join failed:', joinResult.error);
        
        // Start multiple background retries with increasing delays
        [3000, 7000, 15000].forEach((delay, index) => {
          setTimeout(() => {
            console.log(`Background retry ${index + 1} for chat room join...`);
            socketService.enhancedJoinChatRoom(chatId, bookingId, {
              timeout: 10000,
              retryCount: 1
            })
            .then(retryResult => {
              console.log(`Background retry ${index + 1} result:`, retryResult);
              if (retryResult.success) {
                // Refresh messages to ensure we have the latest
                loadMessages();
              }
            })
            .catch(error => {
              console.error(`Background retry ${index + 1} failed:`, error);
            });
          }, delay);
        });
        
        return false;
      }
    } catch (error) {
      console.error('Error in enhanced join:', error);
      setLoading(false);
      return false;
    }
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
  const [chatIdToUse, setChatIdToUse] = useState<string>('');
  const [bookingIdToUse, setBookingIdToUse] = useState<string>('');
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
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasAttemptedJoin, setHasAttemptedJoin] = useState(false);
  const [joinAttempts, setJoinAttempts] = useState(0);
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
  const [isRetryRetryRetryRetryJoining, setIsRetryRetryRetryRetryJoining] = useState(false);
  const [hasTriedRetryRetryRetryRetryBothIds, setHasTriedRetryRetryRetryRetryBothIds] = useState(false);
  const [hasTriedRetryRetryRetryRetryChatIdOnly, setHasTriedRetryRetryRetryRetryChatIdOnly] = useState(false);
  const [hasTriedRetryRetryRetryRetryBookingIdOnly, setHasTriedRetryRetryRetryRetryBookingIdOnly] = useState(false);

  // Load messages from the server
  const loadMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if we have a valid chat ID or booking ID
      if (!chatId && !bookingId) {
        setError('No chat ID or booking ID provided');
        setLoading(false);
        return;
      }
      
      // Set IDs for use in the component
      setChatIdToUse(chatId || '');
      setBookingIdToUse(bookingId || '');
      
      // Try to get existing chat data first
      try {
        console.log('Attempting to fetch existing chat data');
        const existingChatResponse = await chatService.getChatByIdOrBookingId(chatId, bookingId);
        console.log('Existing chat response:', existingChatResponse);
        
        // Extract chat ID from response
        const extractedChatId = extractChatId(existingChatResponse);
        console.log('Extracted chat ID:', extractedChatId);
        
        if (extractedChatId) {
          console.log('Found existing chat with ID:', extractedChatId);
          setCurrentChatId(extractedChatId);
          
          // Set current booking ID if available
          if (bookingId) {
            setCurrentBookingId(bookingId);
          } else if (existingChatResponse.data?.booking?._id) {
            setCurrentBookingId(existingChatResponse.data.booking._id);
          }
          
          // Extract chat data
          const chatData = existingChatResponse.data || existingChatResponse;
          
          // Set chat data and messages
          setChatData(chatData);
          setMessages(chatData.messages || []);
          
          // Mark messages as read
          await chatService.markMessagesAsRead(extractedChatId, bookingId);
          
          // Join chat room with both IDs using our enhanced function
          try {
            console.log('Attempting to join chat room with enhanced function');
            // Use our enhanced join function which handles retries internally
            await joinChatRoomEnhanced(extractedChatId, bookingId);
            // The enhanced function handles success/failure and background retries
          } catch (joinError) {
            console.error('Error joining chat room:', joinError);
            // Continue anyway - we'll show the UI and messages can still be sent via HTTP
          }
          return;
        }
      } catch (error) {
        console.log('No existing chat found or error fetching chat, will create new one');
      }
      
      // If we get here, we need to create a new chat
      try {
        console.log('Creating new chat with booking ID:', bookingId);
        const newChat = await chatService.createChat(bookingId);
        console.log('New chat created:', newChat);
        
        // Extract chat ID from response
        const extractedChatId = extractChatId(newChat);
        console.log('Extracted chat ID from new chat:', extractedChatId);
        
        if (!extractedChatId) {
          throw new Error('Could not extract chat ID from new chat response');
        }
        
        // Set current chat and booking IDs
        setCurrentChatId(extractedChatId);
        if (bookingId) {
          setCurrentBookingId(bookingId);
        }
        
        // Set chat data and messages
        setChatData(newChat.data || newChat);
        setMessages((newChat.data?.messages || newChat.messages || []));
        
        // Join chat room with both IDs
        try {
          console.log('Attempting to join chat room with extracted chat ID and booking ID');
          const joinResult = await socketService.joinChatRoom(extractedChatId, bookingId);
          
          if (!joinResult.success) {
            console.warn('Initial chat room join failed, will retry in background');
            // Continue anyway - we'll retry joining in the background
            setTimeout(async () => {
              try {
                console.log('Retrying chat room join in background...');
                await socketService.joinChatRoom(extractedChatId, bookingId);
              } catch (retryError) {
                console.error('Background chat room join retry failed:', retryError);
              }
            }, 2000);
          } else {
            console.log('Successfully joined chat room on first attempt');
          }
        } catch (joinError) {
          console.error('Error joining chat room:', joinError);
          // Continue anyway - we'll show the UI and messages can still be sent via HTTP
        }
      } catch (createError) {
        console.error('Error creating new chat:', createError);
        setError('Failed to create chat. Please try again.');
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Failed to load messages. Please try again.');
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  // Rest of the component...
}

export default ChatScreen;
