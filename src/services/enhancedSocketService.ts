import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { API_URL, LOCAL_NETWORK_API_URL, SOCKET_URL, LOCAL_NETWORK_SOCKET_URL, APP_IDENTIFIER } from '../config';

// For easier debugging
const isDev = __DEV__;

// The base URL for the socket connection - use the SOCKET_URL from config
// Make sure we have a clean socket URL without any trailing slashes or /api
const baseURL = (() => {
  // Remove any trailing slashes
  let url = SOCKET_URL.endsWith('/') ? SOCKET_URL.slice(0, -1) : SOCKET_URL;
  
  // Remove any /api suffix
  if (url.endsWith('/api')) {
    url = url.slice(0, -4);
  }
  
  // Log the final socket URL
  console.log(`[SOCKET] Using socket URL: ${url}`);
  return url;
})();

// Socket instance
let socket: Socket | null = null;

// Event listeners
type BookingListener = (bookingData: any) => void;
const bookingListeners: BookingListener[] = [];

// Track connection status
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Keep track of chat room join attempts to avoid infinite loops
const chatJoinAttempts = new Map<string, number>();
const MAX_JOIN_ATTEMPTS = 3;

// Timeout for join attempts (ms)
const JOIN_TIMEOUT = 10000;

// Timeout for enhanced join attempts (ms)
const ENHANCED_JOIN_TIMEOUT = 15000;

// Keep track of joined chat rooms to prevent duplicate join attempts
const joinedRooms = new Map<string, { timestamp: number, success: boolean }>();
const JOIN_ROOM_CACHE_TTL = 30000; // 30 seconds

// Track the last known socket state to reduce logging
let lastKnownSocketState = false;

// Keep track of recent socket connection attempts
let lastConnectionAttempt = 0;
const CONNECTION_THROTTLE_MS = 2000; // 2 seconds minimum between connection attempts

// Type definition for join room result
interface JoinRoomResult {
  success: boolean;
  error?: string | null;
  data?: any;
}

// Enhanced logging
const log = (message: string, ...args: any[]) => {
  if (isDev) console.log(`[SOCKET] ${message}`, ...args);
};

const logError = (message: string, ...args: any[]) => {
  console.error(`[SOCKET ERROR] ${message}`, ...args);
};

// Helper to decode JWT token payload
const decodeJwt = (token: string): any => {
  try {
    return jwtDecode(token);
  } catch (error) {
    logError('Error decoding JWT token:', error);
    return null;
  }
};

// Helper function to get a valid astrologer ID
const getAstrologerId = async (): Promise<string | null> => {
  try {
    // Store all potential IDs for debugging
    const potentialIds: {source: string, id: string}[] = [];
    
    // Try to get from astrologer profile in storage
    const astrologerProfileString = await AsyncStorage.getItem('astrologerProfile');
    if (astrologerProfileString) {
      const profile = JSON.parse(astrologerProfileString);
      if (profile && profile._id) {
        log(`Got valid astrologer ID from profile: ${profile._id}`);
        potentialIds.push({source: 'profile', id: profile._id});
        
        // Store this ID to ensure consistency across the app
        await AsyncStorage.setItem('astrologerId', profile._id);
        
        // Update userData if it exists
        try {
          const userDataStr = await AsyncStorage.getItem('userData');
          if (userDataStr) {
            const userData = JSON.parse(userDataStr);
            if (userData) {
              userData.astrologerId = profile._id;
              await AsyncStorage.setItem('userData', JSON.stringify(userData));
              log(`Updated astrologerId in userData: ${profile._id}`);
            }
          }
        } catch (userDataError) {
          logError('Error updating userData with astrologerId:', userDataError);
        }
        
        return profile._id;
      }
    }
    
    // Try from direct astrologerId in storage
    const directId = await AsyncStorage.getItem('astrologerId');
    if (directId) {
      log(`Got valid astrologer ID from direct storage: ${directId}`);
      potentialIds.push({source: 'directId', id: directId});
      return directId;
    }
    
    // Try from userData 
    const userDataStr = await AsyncStorage.getItem('userData');
    if (userDataStr) {
      const userData = JSON.parse(userDataStr);
      if (userData && userData._id) {
        log(`Got valid astrologer ID from userData._id: ${userData._id}`);
        potentialIds.push({source: 'userData._id', id: userData._id});
        
        // Store for future consistency
        await AsyncStorage.setItem('astrologerId', userData._id);
        return userData._id;
      }
      
      if (userData && userData.astrologerId) {
        log(`Got valid astrologer ID from userData.astrologerId: ${userData.astrologerId}`);
        potentialIds.push({source: 'userData.astrologerId', id: userData.astrologerId});
        return userData.astrologerId;
      }
      
      if (userData && userData.id) {
        log(`Got valid astrologer ID from userData.id: ${userData.id}`);
        potentialIds.push({source: 'userData.id', id: userData.id});
        
        // Store for future consistency
        await AsyncStorage.setItem('astrologerId', userData.id);
        // Also update userData.astrologerId
        userData.astrologerId = userData.id;
        await AsyncStorage.setItem('userData', JSON.stringify(userData));
        
        return userData.id;
      }
    }
    
    // Try from JWT token as last resort
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        const decoded = decodeJwt(token);
        if (decoded) {
          if (decoded._id) {
            log(`Got valid astrologer ID from token._id: ${decoded._id}`);
            potentialIds.push({source: 'token._id', id: decoded._id});
            
            // Store for future use
            await AsyncStorage.setItem('astrologerId', decoded._id);
            return decoded._id;
          }
          
          if (decoded.id) {
            log(`Got valid astrologer ID from token.id: ${decoded.id}`);
            potentialIds.push({source: 'token.id', id: decoded.id});
            
            // Store for future use
            await AsyncStorage.setItem('astrologerId', decoded.id);
            return decoded.id;
          }
        }
      }
    } catch (tokenError) {
      logError('Error extracting ID from token:', tokenError);
    }
    
    // Log all potential IDs for debugging
    if (potentialIds.length > 0) {
      log('Found potential astrologer IDs but none were used:', JSON.stringify(potentialIds, null, 2));
    }
    
    return null;
  } catch (error) {
    logError('Error getting valid astrologer ID:', error);
    return null;
  }
};

// Improved network connectivity check function
const checkNetworkConnectivity = async (): Promise<boolean> => {
  try {
    log('Checking network connectivity...');
    
    // Create a timeout promise
    const timeoutPromise = new Promise<Response>((_, reject) => {
      setTimeout(() => reject(new Error('Network check timeout')), 5000);
    });
    
    // Create a fetch promise to check API availability
    // Use HEAD request to minimize data transfer
    const fetchPromise = fetch(API_URL, { 
      method: 'HEAD',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    // Race the fetch against the timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (response.ok) {
      log('Network connectivity confirmed');
      return true;
    } else {
      logError(`Network check failed with status: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError('Network connectivity check failed:', error);
    
    // Try an alternative endpoint as fallback
    try {
      log('Trying alternative endpoint for connectivity check...');
      const altResponse = await fetch(LOCAL_NETWORK_API_URL, { 
        method: 'HEAD',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (altResponse.ok) {
        log('Network connectivity confirmed via alternative endpoint');
        return true;
      }
    } catch (altError) {
      logError('Alternative network check also failed:', altError);
    }
    
    return false;
  }
};

// Check if socket is connected
const isSocketConnected = (): boolean => {
  const connected = socket?.connected || false;
  
  // Only log if state has changed to reduce noise
  if (connected !== lastKnownSocketState) {
    log(`Socket connection state changed: ${connected ? 'connected' : 'disconnected'}`);
    lastKnownSocketState = connected;
  }
  
  return connected;
};

// Get the current socket instance
const getSocket = (): Socket | null => {
  return socket;
};

// Connect to socket
const connectSocket = async (): Promise<Socket | null> => {
  try {
    // If already connecting, don't start another connection attempt
    if (isConnecting) {
      log('Socket connection already in progress...');
      return socket;
    }
    
    // If already connected, return current socket
    if (socket?.connected) {
      log('Socket already connected, ID:', socket.id);
      return socket;
    }
    
    // Throttle connection attempts
    const now = Date.now();
    if (now - lastConnectionAttempt < CONNECTION_THROTTLE_MS) {
      log(`Connection attempt throttled, last attempt was ${now - lastConnectionAttempt}ms ago`);
      await new Promise(resolve => setTimeout(resolve, CONNECTION_THROTTLE_MS));
    }
    
    lastConnectionAttempt = Date.now();
    isConnecting = true;
    log(`Attempting to connect to socket server at: ${baseURL}`);
    
    // Check network connectivity first
    const isNetworkAvailable = await checkNetworkConnectivity();
    if (!isNetworkAvailable) {
      log('Network connectivity issues detected, will attempt socket connection anyway');
    }
    
    // Get authentication token
    log('Retrieving auth token from storage...');
    let authToken = await AsyncStorage.getItem('token');
    
    // Debug: Output token info to console
    log(`Auth token found: ${!!authToken}`);
    if (!authToken) {
      // Try retrieving token with other common key names
      log('No token found with key "token", trying alternative keys...');
      const alternateToken = await AsyncStorage.getItem('authToken');
      if (alternateToken) {
        log('Found token with key "authToken" instead of "token"');
        authToken = alternateToken;
        AsyncStorage.setItem('token', alternateToken); // Sync them
      } else {
        logError('No auth token available for socket connection');
        isConnecting = false;
        return null;
      }
    }

    // Disconnect existing socket if any
    if (socket) {
      log('Disconnecting existing socket before creating new connection');
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch (e) {
        logError('Error disconnecting existing socket:', e);
      }
      socket = null;
    }

    // Get astrologer ID if possible
    const astrologerId = await getAstrologerId();

    // Create a modified auth object that includes the app-specific userType
    const authData = {
      token: authToken,
      userType: 'astrologer', // Identify as astrologer app
      appIdentifier: APP_IDENTIFIER,
      astrologerId: astrologerId || undefined,
      timestamp: Date.now() // Add timestamp to help debug
    };
    
    // Initialize socket with auth data
    socket = io(baseURL, {
      transports: ['websocket'],
      auth: authData,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      timeout: 10000
    });
    
    // Set up event handlers
    socket.on('connect', () => {
      log('Socket connected successfully, ID:', socket.id);
      isConnecting = false;
      reconnectAttempts = 0;
    });
    
    socket.on('connect_error', (err) => {
      logError('Socket connection error:', err.message);
      isConnecting = false;
      
      // Increment reconnect attempts
      reconnectAttempts++;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        logError(`Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
      }
    });
    
    socket.on('disconnect', (reason) => {
      log(`Socket disconnected: ${reason}`);
    });
    
    // Wait for connection or timeout
    const connectionResult = await Promise.race([
      new Promise<Socket>(resolve => {
        socket?.once('connect', () => resolve(socket!));
      }),
      new Promise<null>(resolve => {
        setTimeout(() => {
          if (!socket?.connected) {
            logError('Socket connection timed out');
            isConnecting = false;
            resolve(null);
          }
        }, 10000);
      })
    ]);
    
    isConnecting = false;
    return connectionResult;
  } catch (error) {
    logError('Error in connectSocket:', error);
    isConnecting = false;
    return null;
  }
};

// Disconnect socket
const disconnectSocket = (): void => {
  if (socket) {
    log('Disconnecting socket');
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
};

// Reconnect socket
const reconnectSocket = async (): Promise<Socket | null> => {
  log('Attempting to reconnect socket');
  disconnectSocket();
  return await connectSocket();
};

// Add event listener for new booking requests
const onNewBookingRequest = (callback: BookingListener): void => {
  bookingListeners.push(callback);
  log(`Added booking listener, total listeners: ${bookingListeners.length}`);
};

/**
 * Enhanced version of joinChatRoom with better error handling and timeout management
 * This function is designed to be used in UI contexts where responsiveness is critical
 * It includes a timeout mechanism to prevent blocking the UI thread
 */
const enhancedJoinChatRoom = async (chatId: string = '', bookingId: string = '', options: {
  timeout?: number,
  retryCount?: number,
  retryDelay?: number,
  onProgress?: (status: string) => void
} = {}): Promise<JoinRoomResult> => {
  // Set default options
  const {
    timeout = ENHANCED_JOIN_TIMEOUT,
    retryCount = MAX_JOIN_ATTEMPTS,
    retryDelay = 2000,
    onProgress = (status: string) => log(`Join progress: ${status}`)
  } = options;
  
  // Create a timeout promise
  const timeoutPromise = new Promise<JoinRoomResult>((resolve) => {
    setTimeout(() => {
      resolve({ 
        success: false, 
        error: `Join operation timed out after ${timeout}ms` 
      });
    }, timeout);
  });
  
  // Create the join promise
  const joinPromise = (async () => {
    try {
      // First ensure we're connected
      onProgress('Connecting to socket server');
      const socketInstance = await connectSocket();
      
      // Check if socket connection was successful
      if (!socketInstance || !socketInstance.connected) {
        onProgress('Socket connection failed, retrying...');
        // Try one more time with a short delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retrySocket = await connectSocket();
        
        if (!retrySocket || !retrySocket.connected) {
          onProgress('Socket connection failed after retry');
          return {
            success: false,
            error: 'Failed to establish socket connection'
          };
        }
      }
      
      // Socket is now connected, check network connectivity
      onProgress('Checking network connectivity');
      const isConnected = await checkNetworkConnectivity();
      if (!isConnected) {
        onProgress('Network connectivity issues detected, will try anyway');
      }
      
      // Try to join the chat room with multiple attempts
      onProgress('Attempting to join chat room');
      
      // Try multiple strategies to join the room
      // 1. First try with both IDs
      if (chatId && bookingId) {
        onProgress('Trying to join with both chat ID and booking ID');
        const bothIdsResult = await tryJoinChatRoom({ chatId, bookingId });
        if (bothIdsResult.success) {
          return bothIdsResult;
        }
        onProgress('Failed to join with both IDs, trying alternatives...');
      }
      
      // 2. Try with just chat ID if available
      if (chatId) {
        onProgress('Trying to join with chat ID only');
        const chatIdResult = await tryJoinChatRoom({ chatId });
        if (chatIdResult.success) {
          return chatIdResult;
        }
        onProgress('Failed to join with chat ID only');
      }
      
      // 3. Try with just booking ID if available
      if (bookingId) {
        onProgress('Trying to join with booking ID only');
        const bookingIdResult = await tryJoinChatRoom({ bookingId });
        if (bookingIdResult.success) {
          return bookingIdResult;
        }
        onProgress('Failed to join with booking ID only');
      }
      
      // All attempts failed
      return {
        success: false,
        error: 'Failed to join chat room after trying all available methods'
      };
    } catch (error) {
      console.error('[SOCKET] Enhanced join error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error joining chat room' 
      };
    }
  })();
  
  // Race the promises
  return Promise.race([joinPromise, timeoutPromise]);
};

// Helper function to try joining a chat room with different parameters
const tryJoinChatRoom = (params: { chatId?: string, bookingId?: string }): Promise<JoinRoomResult> => {
  return new Promise((resolve) => {
    const { chatId, bookingId } = params;
    
    // Generate a unique key for this join attempt
    const joinKey = `${chatId || ''}:${bookingId || ''}`;
    
    // Check if we've recently tried to join this room
    const cachedJoin = joinedRooms.get(joinKey);
    if (cachedJoin && Date.now() - cachedJoin.timestamp < JOIN_ROOM_CACHE_TTL) {
      if (cachedJoin.success) {
        log(`Using cached successful join for ${joinKey}`);
        return resolve({ success: true, data: { chatId, bookingId, cached: true } });
      } else {
        log(`Skipping recently failed join attempt for ${joinKey}`);
        return resolve({ success: false, error: 'Recent join attempt failed', data: { cached: true } });
      }
    }
    
    // Ensure socket is connected
    if (!socket || !socket.connected) {
      log('Socket not connected for join attempt');
      return resolve({ success: false, error: 'Socket not connected' });
    }
    
    // Create a timeout for this attempt
    const attemptTimeout = setTimeout(() => {
      log('Join attempt timed out');
      socket?.off('chat:joined', handleJoined);
      socket?.off('chat:error', handleError);
      resolve({ success: false, error: 'Join attempt timed out' });
    }, JOIN_TIMEOUT);
    
    // One-time event handler for successful join
    const handleJoined = (data: any) => {
      clearTimeout(attemptTimeout);
      log('Successfully joined chat room:', data);
      socket?.off('chat:joined', handleJoined);
      socket?.off('chat:error', handleError);
      
      // Cache the successful join
      joinedRooms.set(joinKey, { timestamp: Date.now(), success: true });
      
      resolve({ success: true, data });
    };
    
    // One-time event handler for errors
    const handleError = (data: any) => {
      // Only handle errors related to joining
      if (data.message && (data.message.includes('join') || data.message.includes('room'))) {
        clearTimeout(attemptTimeout);
        log('Error joining chat room:', data.message);
        socket?.off('chat:joined', handleJoined);
        socket?.off('chat:error', handleError);
        
        // Cache the failed join attempt
        joinedRooms.set(joinKey, { timestamp: Date.now(), success: false });
        
        resolve({ success: false, error: data.message });
      }
    };
    
    // Register event handlers
    socket?.on('chat:joined', handleJoined);
    socket?.on('chat:error', handleError);
    
    // Get astrologer ID if possible
    getAstrologerId().then(astrologerId => {
      // Prepare join payload
      const payload: any = { userType: 'astrologer' };
      if (chatId) payload.chatId = chatId;
      if (bookingId) payload.bookingId = bookingId;
      if (astrologerId) payload.astrologerId = astrologerId;
      
      // Emit join event
      socket?.emit('chat:join', payload);
    });
  });
};

// Send a message via socket with HTTP fallback
const sendChatMessage = async (
  chatId: string, 
  bookingId: string, 
  message: string,
  senderId?: string
): Promise<{success: boolean, error?: string, messageId?: string}> => {
  try {
    log(`Attempting to send message to chat ${chatId} (booking ${bookingId})`);
    
    // Ensure we have an astrologer ID
    if (!senderId) {
      senderId = await getAstrologerId();
      if (!senderId) {
        return { success: false, error: 'Could not determine astrologer ID' };
      }
    }
    
    // First try to send via HTTP API for reliability
    try {
      log('Sending message via HTTP API first...');
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        return { success: false, error: 'No authentication token available' };
      }
      
      // Determine which endpoint to use
      let endpoint = '';
      if (chatId) {
        endpoint = `${API_URL}/chats/${chatId}/messages`;
      } else if (bookingId) {
        endpoint = `${API_URL}/chats/booking/${bookingId}/messages`;
      } else {
        return { success: false, error: 'No chat ID or booking ID provided' };
      }
      
      // Send message via HTTP
      const response = await axios.post(endpoint, 
        { message, astrologerId: senderId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.status >= 200 && response.status < 300) {
        log('Message sent successfully via HTTP API');
        return { 
          success: true, 
          messageId: response.data.messageId || response.data._id || response.data.id 
        };
      }
    } catch (httpError) {
      log('HTTP API message send failed, falling back to socket:', httpError);
      // Continue to socket fallback
    }
    
    // If HTTP failed or wasn't available, try socket
    // Ensure socket is connected
    if (!socket?.connected) {
      log('Socket not connected, attempting to connect...');
      await connectSocket();
      
      if (!socket?.connected) {
        return { success: false, error: 'Could not connect to socket server' };
      }
    }
    
    // Send via socket
    return new Promise((resolve) => {
      // Set a timeout for the socket send
      const timeout = setTimeout(() => {
        log('Socket message send timed out');
        resolve({ success: false, error: 'Socket message send timed out' });
      }, 5000);
      
      // Create a unique message ID for tracking
      const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // One-time event handler for message acknowledgement
      const handleAck = (ackData: any) => {
        clearTimeout(timeout);
        socket?.off('chat:messageSent', handleAck);
        socket?.off('chat:error', handleError);
        
        log('Message sent successfully via socket');
        resolve({ 
          success: true, 
          messageId: ackData.messageId || ackData._id || tempMessageId 
        });
      };
      
      // One-time event handler for errors
      const handleError = (errorData: any) => {
        if (errorData.messageId === tempMessageId) {
          clearTimeout(timeout);
          socket?.off('chat:messageSent', handleAck);
          socket?.off('chat:error', handleError);
          
          log('Error sending message via socket:', errorData.message);
          resolve({ success: false, error: errorData.message });
        }
      };
      
      // Register event handlers
      socket?.once('chat:messageSent', handleAck);
      socket?.once('chat:error', handleError);
      
      // Emit message event
      socket?.emit('chat:message', { 
        chatId, 
        bookingId,
        message, 
        astrologerId: senderId,
        messageId: tempMessageId,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    logError('Error in sendChatMessage:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error sending message' 
    };
  }
};

// Export all functions
export {
  connectSocket,
  disconnectSocket,
  reconnectSocket,
  enhancedJoinChatRoom,
  sendChatMessage,
  onNewBookingRequest,
  isSocketConnected,
  getSocket,
  checkNetworkConnectivity,
  getAstrologerId
};

export default {
  connectSocket,
  disconnectSocket,
  reconnectSocket,
  enhancedJoinChatRoom,
  sendChatMessage,
  onNewBookingRequest,
  isSocketConnected,
  getSocket,
  checkNetworkConnectivity,
  getAstrologerId
};
