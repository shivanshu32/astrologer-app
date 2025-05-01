import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_URL, LOCAL_NETWORK_API_URL, APP_IDENTIFIER } from '../config';

// For easier debugging
const isDev = __DEV__;

// The base URL for the socket connection - use same as API host
const baseURL = API_URL.replace('/api', ''); // Strip /api path if present

// Configure reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 5;

// Track reconnect attempts
let reconnectAttempts = 0;

// Track if already trying to connect to prevent parallel connection attempts
let isConnecting = false;

// Store active socket connection
let socket: Socket | null = null;

// Store registered event listeners
type BookingListener = (bookingData: any) => void;
const bookingListeners: BookingListener[] = [];

// Logging helper - prefixes all socket logs
const log = (message: string, ...args: any[]) => {
  if (isDev) console.log(`[SOCKET] ${message}`, ...args);
};

const logError = (message: string, ...args: any[]) => {
  console.error(`[SOCKET ERROR] ${message}`, ...args);
};

// Helper to decode JWT token payload
const decodeJwt = (token: string): any => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
};

// Helper function to get a valid astrologer ID
const getValidAstrologerId = async (): Promise<string | null> => {
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

// Keep track of recent socket connection attempts
let lastConnectionAttempt = 0;
const CONNECTION_THROTTLE_MS = 2000; // 2 seconds minimum between connection attempts

// Track the last known socket state to reduce logging
let lastKnownSocketState = false;

// Keep track of joined chat rooms to prevent duplicate join attempts
const joinedRooms = new Map<string, { timestamp: number, success: boolean }>();
const JOIN_ROOM_CACHE_TTL = 30000; // 30 seconds

// Add missing JoinRoomResult type
interface JoinRoomResult {
  success: boolean;
  error?: string | null;
  data?: any;
}

// Add missing checkNetworkConnectivity function
const checkNetworkConnectivity = async (): Promise<boolean> => {
  try {
    console.log('[SOCKET] Checking network connectivity...');
    const networkTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Network check timeout')), 3000)
    );
    
    const networkCheck = fetch(API_URL, { 
      method: 'HEAD',
      cache: 'no-store' 
    });
    
    await Promise.race([networkCheck, networkTimeout]);
    return true;
  } catch (error) {
    console.error('[SOCKET] Network connectivity check failed:', error);
    return false;
  }
};

/**
 * Check if the socket is already connected
 */
export const isSocketConnected = (): boolean => {
  if (!socket) return false;
  
  // Add more reliable connection checking
  const connected = socket.connected && !socket.disconnected;
  
  // Only log connection status when it changes
  if (connected !== lastKnownSocketState) {
    console.log(`[SOCKET] Connection status changed: ${connected ? 'connected' : 'disconnected'}`);
    lastKnownSocketState = connected;
  }
  
  return connected;
};

/**
 * Connect to the socket server
 */
export const connectSocket = async (): Promise<Socket | null> => {
  try {
    // Check if we're throttling connection attempts
    const now = Date.now();
    if (now - lastConnectionAttempt < CONNECTION_THROTTLE_MS) {
      // If recent connection attempt, just return the existing socket
      if (socket) {
        return socket;
      }
      // Wait the required time before attempting again
      await new Promise(resolve => setTimeout(resolve, CONNECTION_THROTTLE_MS - (now - lastConnectionAttempt)));
    }
    
    // Update the last connection attempt time
    lastConnectionAttempt = now;
    
    // If socket is already connected, return it without logging redundant messages
    if (isSocketConnected()) {
      return socket;
    }
    
    console.log('[SOCKET] Connecting to socket server...');
    
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
    
    isConnecting = true;
    log(`Attempting to connect to socket server at: ${baseURL}`);
    
    // Get authentication token
    log('Retrieving auth token from storage...');
    const token = await AsyncStorage.getItem('token');
    
    // Debug: Output token info to console
    log(`Auth token found: ${!!token}`);
    if (token) {
      // Log just the first and last few characters for security
      const tokenPreview = token.length > 10 
        ? `${token.substring(0, 5)}...${token.substring(token.length - 5)}`
        : '***';
      log(`Token preview: ${tokenPreview}, Length: ${token.length}`);
      
      try {
        // Decode and check if token contains userType
        const decoded = decodeJwt(token);
        if (decoded) {
          log('Decoded token payload:', decoded);
          if (decoded.userType !== 'astrologer') {
            log('⚠️ Warning: Token userType is not "astrologer", this will cause connection issues');
          }
        }
      } catch (e) {
        logError('Error checking token format:', e);
      }
    }
    
    if (!token) {
      // Try retrieving token with other common key names
      log('No token found with key "token", trying alternative keys...');
      const alternateToken = await AsyncStorage.getItem('authToken');
      if (alternateToken) {
        log('Found token with key "authToken" instead of "token"');
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
      socket.disconnect();
    }

    // Create a modified auth object that includes the app-specific userType
    // This ensures the socket connection will be identified as an astrologer regardless of token content
    const authData: {
      token: string | null;
      userType: string;
      appIdentifier: string;
      mobileNumber?: string;
      astrologerId?: string;
      email?: string;
      userId?: string;
    } = {
      token,
      // Add explicit astrologer type for this app - backend will use this if token doesn't specify
      userType: 'astrologer',
      appIdentifier: APP_IDENTIFIER // Use the imported constant
    };

    // Try to get the astrologer profile data from storage
    try {
      const userDataString = await AsyncStorage.getItem('userData');
      let astrologerProfile: any = null;
      
      try {
        const astrologerProfileString = await AsyncStorage.getItem('astrologerProfile');
        if (astrologerProfileString) {
          astrologerProfile = JSON.parse(astrologerProfileString);
          log('Found astrologer profile in storage');
        }
      } catch (error) {
        logError('Error parsing astrologer profile:', error);
      }
      
      if (userDataString) {
        const userData = JSON.parse(userDataString);
        
        // Add mobile number to auth data for easier identification by backend
        if (userData.mobileNumber || userData.mobile) {
          log(`Adding mobile number to socket auth: ${userData.mobileNumber || userData.mobile}`);
          authData.mobileNumber = userData.mobileNumber || userData.mobile;
        }
        
        // Add email to auth data for easier identification
        if (userData.email) {
          log(`Including email in socket auth: ${userData.email}`);
          authData.email = userData.email;
        }
        
        // Add user ID but keep userType as astrologer
        if (userData.id || userData._id) {
          log(`Adding userId (${userData.id || userData._id}) to socket auth data`);
          authData.userId = userData.id || userData._id;
        }
        
        // If we have astrologer profile, use its ID
        if (astrologerProfile && astrologerProfile._id) {
          log(`Including astrologer ID in socket auth: ${astrologerProfile._id}`);
          authData.astrologerId = astrologerProfile._id;
        }
        // If not, check if userData has an astrologer ID property
        else if (userData.astrologerId) {
          log(`Including astrologer ID from user data: ${userData.astrologerId}`);
          authData.astrologerId = userData.astrologerId;
        }
      }
      
      // If no astrologer ID found yet, check if we have it directly in AsyncStorage
      if (!authData.astrologerId) {
        try {
          const directAstrologerId = await AsyncStorage.getItem('astrologerId');
          if (directAstrologerId) {
            log(`Using direct astrologerId from AsyncStorage: ${directAstrologerId}`);
            authData.astrologerId = directAstrologerId;
          }
        } catch (error) {
          logError('Error getting direct astrologerId:', error);
        }
      }
      
      // Last resort: Check for specific astrologer ID for Astro Uttam
      if (!authData.astrologerId && authData.mobileNumber === '9755824884') {
        const targetId = '67ffe412a96474bf13f80a14';
        log(`No astrologer ID found, but mobile matches known astrologer. Using ID: ${targetId}`);
        authData.astrologerId = targetId;
      }
    } catch (error) {
      logError('Error getting user/astrologer data from storage:', error);
    }

    // Just before creating the socket, add a final check
    // Check if appIdentifier has been overwritten somehow
    if (authData.appIdentifier !== APP_IDENTIFIER) {
      logError(`App identifier was incorrectly set to ${authData.appIdentifier}, fixing to ${APP_IDENTIFIER}`);
      authData.appIdentifier = APP_IDENTIFIER;
    }

    // Check if userType has been overwritten
    if (authData.userType !== 'astrologer') {
      logError(`User type was incorrectly set to ${authData.userType}, fixing to astrologer`);
      authData.userType = 'astrologer';
    }

    // Log the final auth data for debugging
    log(`Final socket auth data: ${JSON.stringify(authData)}`);

    // Connect with authentication
    log(`Creating socket with auth data: ${JSON.stringify(authData)}`);
    
    // Try different socket configurations to overcome WebSocket errors
    try {
      // First try to connect with WebSocket transport only, which is more efficient
      log('Connecting with WebSocket transport');
      socket = io(baseURL, {
        auth: authData,
        transports: ['websocket'],
        forceNew: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: 1000,
        timeout: 15000, // Increase timeout
        query: {
          appType: 'astrologer-app',
          appVersion: '1.0.0',
          platform: Platform.OS
        }
      });
      
      // Set up error handler to detect WebSocket issues
      socket.on('connect_error', (error) => {
        logError(`WebSocket connection error: ${error.message}`, error);
        
        // If we get a WebSocket error, try the fallback approach with polling
        if (error.message.includes('websocket')) {
          logError('WebSocket transport failed, will try with polling fallback');
          
          // Disconnect the failed socket
          socket?.disconnect();
          
          // Now try with both polling and WebSocket (polling first as fallback)
          log('Connecting with polling fallback transport');
          socket = io(baseURL, {
            auth: authData,
            transports: ['polling', 'websocket'], // Try polling first, then WebSocket
            forceNew: true,
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
            reconnectionDelay: 1000,
            timeout: 20000, // Even longer timeout for polling
            query: {
              appType: 'astrologer-app',
              appVersion: '1.0.0',
              platform: Platform.OS,
              transportFallback: 'true' // Mark this as using fallback transport
            }
          });
          
          // Set up event handlers for the new socket
          setupSocketEventHandlers(socket);
        } else if (error.message.includes('jwt')) {
          logError('JWT authentication error detected. Token may be invalid or expired.');
        }
        
        isConnecting = false;
        reconnectSocket();
      });
      
      // Set up other event handlers
      setupSocketEventHandlers(socket);
      
    } catch (socketError) {
      logError('Error creating socket:', socketError);
      isConnecting = false;
      return null;
    }

    return socket;
  } catch (error) {
    logError('Error connecting to socket:', error);
    isConnecting = false;
    return null;
  }
};

// Helper function to set up socket event handlers
const setupSocketEventHandlers = (socketInstance: Socket) => {
  if (!socketInstance) return;
  
  // Setup event listeners
  socketInstance.on('connect', () => {
    log(`Socket connected successfully, ID: ${socketInstance?.id}`);
    isConnecting = false;
    reconnectAttempts = 0;
    
    // Debug: Emit a test event to verify connection
    log('Sending test connection event');
    socketInstance?.emit('test-connection', { clientTime: new Date().toISOString() });
  });

  // Add handler for welcome message from server
  socketInstance.on('welcome', (data) => {
    log('Received welcome message from server:', data);
    // This indicates the server has successfully authenticated us
  });

  socketInstance.on('disconnect', (reason) => {
    logError(`Socket disconnected: ${reason}`);
    isConnecting = false;
    
    // Handle potential reconnection
    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
      // The disconnection was intentional, so don't reconnect
      log('Disconnection was intentional, not reconnecting');
    } else {
      // The connection was dropped due to network issues, try to reconnect
      log('Unexpected disconnection, will try to reconnect');
      reconnectSocket();
    }
  });

  socketInstance.on('error', (error) => {
    logError('Socket error:', error);
    isConnecting = false;
  });

  // Listen for new booking requests
  socketInstance.on('new-booking-request', (data) => {
    log('✅ New booking request received:', data);
    
    // Add more detailed logging to diagnose notification issues
    try {
      // Ensure data exists and has expected properties
      if (!data) {
        logError('Received empty booking request data');
        return;
      }
      
      // Log the complete data for debugging
      log('Full booking request data:', JSON.stringify(data, null, 2));
      
      log(`Booking ID: ${data._id || 'No ID'}`);
      log(`Status: ${data.status || 'pending'}`);
      log(`User ID: ${data.userId?._id || data.userId || 'Unknown'}`);
      log(`Time received: ${new Date().toISOString()}`);
      
      // Add additional debug info
      log('Active socket listeners:', bookingListeners.length);
      log('Socket connection state:', socketInstance?.connected ? 'connected' : 'disconnected');
      
      // Force refresh the UI by dispatching an event to the document
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new Event('booking-notification-received'));
      }
      
      // Try to ping back to confirm receipt (helps debug bidirectional issues)
      if (socketInstance) {
        socketInstance.emit('booking-notification-received', { 
          bookingId: data._id, 
          receivedAt: new Date().toISOString(),
          clientInfo: {
            platform: Platform.OS,
            appType: 'astrologer-app'
          }
        });
      }
      
      // Notify all registered listeners
      if (bookingListeners.length > 0) {
        log(`Notifying ${bookingListeners.length} listeners`);
        bookingListeners.forEach(listener => {
          try {
            listener(data);
          } catch (listenerError: any) {
            logError(`Error in booking request listener: ${listenerError.message}`, listenerError);
          }
        });
      } else {
        logError('No booking request listeners registered!');
      }
    } catch (err) {
      logError('Error processing booking request:', err);
    }
  });
  
  // Add chat-related event handlers
  
  // Handle successful chat room join
  socketInstance.on('chat:joined', (data) => {
    log('Successfully joined chat room:', data);
  });
  
  // Handle chat errors
  socketInstance.on('chat:error', (error) => {
    logError('Chat error from server:', error);
  });
  
  // Handle new message received
  socketInstance.on('chat:newMessage', (data) => {
    log('New chat message received:', data);
  });
  
  // Handle message sent confirmation
  socketInstance.on('chat:messageSent', (data) => {
    log('Message sent confirmation received:', data);
  });
  
  // Handle typing notifications
  socketInstance.on('chat:typing', (data) => {
    log('User typing status update:', data);
  });
  
  // Handle messages read status updates
  socketInstance.on('chat:messagesRead', (data) => {
    log('Messages read status update:', data);
  });
  
  // Add a test event to verify server communication
  socketInstance.on('test-response', (data) => {
    log('Received test response from server:', data);
  });
};

// Disconnect socket
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnecting = false;
    log('Socket disconnected');
  }
};

// Reconnect socket
const reconnectSocket = async () => {
  // Don't attempt to reconnect if max attempts reached
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log(`Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    return;
  }
  
  reconnectAttempts++;
  log(`Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
  
  // Wait for a bit before reconnecting
  setTimeout(async () => {
    try {
      await connectSocket();
    } catch (error) {
      logError('Error during reconnection:', error);
    }
  }, 2000 * reconnectAttempts); // Exponential backoff
};

// Add event listener for new booking requests
export const onNewBookingRequest = (callback: BookingListener) => {
  bookingListeners.push(callback);
  log(`Added booking request listener. Total listeners: ${bookingListeners.length}`);
  return () => {
    const index = bookingListeners.indexOf(callback);
    if (index !== -1) {
      bookingListeners.splice(index, 1);
      log(`Removed booking request listener. Total listeners: ${bookingListeners.length}`);
    }
  };
};

/**
 * Advanced diagnostic function to check all aspects of socket connection and provide debugging information
 * This can be called from the app to troubleshoot connection issues
 */
export const runDiagnostics = async (): Promise<{
  success: boolean;
  detailedReport: string;
  connectionInfo: any;
  recommendations: string[];
}> => {
  // Store debug information
  const details: string[] = [];
  const recommendations: string[] = [];
  let connectionSuccess = false;
  
  try {
    details.push(`Socket diagnostic started at ${new Date().toISOString()}`);
    
    // Check token
    const token = await AsyncStorage.getItem('token');
    const authToken = await AsyncStorage.getItem('authToken');
    
    details.push(`Token exists: ${!!token}, Length: ${token?.length || 0}`);
    details.push(`AuthToken exists: ${!!authToken}, Length: ${authToken?.length || 0}`);
    
    if (!token && !authToken) {
      recommendations.push('No authentication token found. Please log out and log in again.');
    }
    
    // Check network
    details.push(`Using baseURL: ${baseURL}`);
    details.push(`API URL: ${API_URL}`);
    details.push(`Local Network API URL: ${LOCAL_NETWORK_API_URL}`);
    
    // Check current socket status
    const connected = isSocketConnected();
    details.push(`Socket connected: ${connected}`);
    details.push(`Socket ID: ${socket?.id || 'N/A'}`);
    connectionSuccess = connected;
    
    if (!connected) {
      recommendations.push('Socket is not connected. Try refreshing the app or restarting it.');
    }
    
    // Listener registration status
    details.push(`Registered listeners: ${bookingListeners.length}`);
    if (bookingListeners.length === 0) {
      recommendations.push('No booking request listeners are registered. The app may not respond to notifications.');
    }
    
    return {
      success: connectionSuccess,
      detailedReport: details.join('\n'),
      connectionInfo: {
        connected: socket?.connected || false,
        socketId: socket?.id || null,
        baseUrl: baseURL,
        tokenExists: !!token || !!authToken,
        listenersCount: bookingListeners.length,
        reconnectAttempts
      },
      recommendations
    };
  } catch (error: any) {
    logError('Error during diagnostics:', error);
    details.push(`Error during diagnostics: ${error.message}`);
    recommendations.push('An error occurred during diagnostics. Check your network connection and try again.');
    
    return {
      success: false,
      detailedReport: details.join('\n'),
      connectionInfo: {
        connected: false,
        error: error.message
      },
      recommendations
    };
  }
};

// Add a test method to check if notifications are working
export const testBookingNotification = () => {
  if (!socket || !socket.connected) {
    logError('Cannot test notification: Socket not connected');
    return false;
  }
  
  // Create a test booking object
  const testBooking = {
    _id: `test-${Date.now()}`,
    status: 'pending',
    consultationType: 'chat',
    amount: 500,
    userId: {
      _id: 'test-user',
      name: 'Test User',
      mobileNumber: '1234567890'
    },
    notes: 'This is a test booking request',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Manually trigger the event handler
  log('Manually triggering booking notification handler with test data');
  
  // Call all registered listeners with test data
  bookingListeners.forEach(listener => {
    try {
      listener(testBooking);
    } catch (error) {
      logError('Error in test notification:', error);
    }
  });
  
  return true;
};

/**
 * Join a chat room with either chat ID or booking ID
 */
export const joinChatRoom = async (chatId: string = '', bookingId: string = ''): Promise<JoinRoomResult> => {
  try {
    // Skip if we have neither chat ID nor booking ID
    if (!chatId && !bookingId) {
      console.log('[SOCKET] Cannot join chat room: No chat ID or booking ID provided');
      return { success: false, error: 'No chat ID or booking ID provided' };
    }
    
    // Generate a cache key using both IDs to uniquely identify this room
    const roomCacheKey = `${chatId}:${bookingId}`;
    
    // Check if we've recently tried joining this room
    const cachedJoin = joinedRooms.get(roomCacheKey);
    if (cachedJoin && Date.now() - cachedJoin.timestamp < JOIN_ROOM_CACHE_TTL) {
      console.log(`[SOCKET] Using cached join result for room ${roomCacheKey}: ${cachedJoin.success ? 'success' : 'failed'}`);
      return { success: cachedJoin.success, error: cachedJoin.success ? null : 'Previous join attempt failed' };
    }
    
    // Check network connectivity first
    console.log('[SOCKET] Checking network connectivity before attempting to join chat room...');
    const connected = await checkNetworkConnectivity();
    if (!connected) {
      console.error('[SOCKET] Network not available for chat join');
      joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: false });
      return { success: false, error: 'Network not available' };
    }
    
    console.log('[SOCKET] Network connectivity confirmed for chat join');
      
    // Connect to socket if not already connected
    const socket = await connectSocket();
    if (!socket) {
      console.error('[SOCKET] Cannot join chat room: Socket connection failed');
      joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: false });
        return { success: false, error: 'Socket connection failed' };
      }
    
    // Determine which ID to use for joining
    let roomId = chatId || bookingId;
    let roomType = chatId ? 'chatId' : 'bookingId';
    
    console.log(`[SOCKET] Joining chat room with ${roomType}: ${roomId}`);
    
    // Get the astrologer ID
    const astrologerId = await getValidAstrologerId();
    if (!astrologerId) {
      console.error('[SOCKET] Cannot join chat room: Could not determine astrologer ID');
      joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: false });
      return { success: false, error: 'Could not determine astrologer ID' };
    }
    
    // Prepare payload for join event
    const payload: any = {
      userType: 'astrologer',
      astrologerId: astrologerId
    };
    
    // Add the appropriate ID to the payload
    if (chatId) {
      payload.chatId = chatId;
    }
    if (bookingId) {
      payload.bookingId = bookingId;
          }
    
    // Join room via promise
    return new Promise((resolve) => {
      // Set a timeout in case the server doesn't respond
      const timeoutId = setTimeout(() => {
        console.error('[SOCKET ERROR] Chat room join operation timed out');
      socket.off('chat:joined');
      socket.off('chat:error');
        joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: false });
        resolve({ success: false, error: 'Join operation timed out' });
      }, 5000);
      
      // Listen for join success
      socket.once('chat:joined', (data) => {
        clearTimeout(timeoutId);
        console.log('[SOCKET] Successfully joined chat room:', data?.roomId || roomId);
        socket.off('chat:error');
        joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: true });
        resolve({ success: true, data });
      });
      
      // Listen for join error
      socket.once('chat:error', (error) => {
        clearTimeout(timeoutId);
        console.error('[SOCKET ERROR] Error joining chat room:', error);
        socket.off('chat:joined');
        joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: false });
        resolve({ success: false, error: error?.message || 'Failed to join chat room' });
      });
      
      // First try HTTP API approach for more reliable joining
      console.log('[SOCKET] Attempting to join chat room via HTTP API first');
      let joinUrl = '';
      
      if (chatId) {
        joinUrl = `${API_URL}/chats/${chatId}/join`;
      } else if (bookingId) {
        joinUrl = `${API_URL}/chats/booking/${bookingId}/join`;
        }
        
      if (joinUrl) {
        console.log(`[SOCKET] Making HTTP request to: ${joinUrl}`);
          
        // Get token first, then make the fetch request
        getToken().then(authToken => {
          fetch(joinUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
              'X-App-Identifier': APP_IDENTIFIER,
              'X-Astrologer-Id': astrologerId
            },
            body: JSON.stringify(payload)
          })
          .then(response => {
            if (response.ok) {
              return response.json();
        }
            console.log(`[SOCKET] HTTP chat join failed with status: ${response.status}`);
            throw new Error('HTTP join failed');
          })
          .then(data => {
            if (data?.success) {
              // HTTP join successful, we're already joined via HTTP so socket will confirm
              console.log('[SOCKET] Successfully joined chat room via HTTP');
        }
          })
          .catch(() => {
            // If HTTP join fails, try socket join
            console.log('[SOCKET] Emitting chat:join event with payload:', payload);
            socket.emit('chat:join', payload);
          });
        });
      } else {
        // If no URL, just use socket
        console.log('[SOCKET] Emitting chat:join event with payload:', payload);
        socket.emit('chat:join', payload);
      }
    });
  } catch (error) {
    console.error('[SOCKET ERROR] Error in joinChatRoom:', error);
    return { success: false, error: 'Unknown error joining chat room' };
  }
};

/**
 * Send a message via socket
 * @param chatId Chat ID to send message to
 * @param bookingId Related booking ID
 * @param message Message content
 * @param senderId ID of the sender (astrologer ID)
 * @returns Promise with success status and message ID if successful
 */
export const sendChatMessage = async (
  chatId: string,
  bookingId: string,
  message: string,
  senderId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    log(`Attempting to send message to chat: ${chatId}`);
    
    // If socket is not connected, try to connect first
    if (!socket || !socket.connected) {
      log('Socket not connected. Attempting to connect first...');
      const connectionResult = await connectSocket();
      if (!connectionResult) {
        throw new Error('Failed to establish socket connection');
      }
    }
    
    // Ensure we're in the chat room
    await joinChatRoom(chatId);
    
    // Send the message
    return new Promise((resolve) => {
      // Set timeout for send operation
      const timeout = setTimeout(() => {
        log('Send message operation timed out');
        resolve({ success: false, error: 'Operation timed out' });
      }, 5000);
      
      // Setup success handler
      socket?.once('chat:messageSent', (data) => {
        clearTimeout(timeout);
        log(`Message sent successfully to chat: ${chatId}`, data);
        resolve({ success: true, messageId: data?.messageId || Date.now().toString() });
      });
      
      // Setup error handler
      socket?.once('chat:error', (error) => {
        clearTimeout(timeout);
        logError(`Error sending message to chat: ${chatId}`, error);
        resolve({ success: false, error: error?.message || 'Unknown error' });
      });
      
      // Emit message event with simplified payload
      // IMPORTANT: Only include essential fields - backend will get astrologer ID from socket auth
      log(`Emitting chat:sendMessage event for chat ${chatId}`);
      socket?.emit('chat:sendMessage', {
        chatId,
        bookingId,
        message,
        senderType: 'astrologer'
        // Do NOT include senderId - backend will get it from the socket authentication
      });
    });
  } catch (error: any) {
    logError(`Error in sendChatMessage: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// Define baseUrl for HTTP requests
const getBaseUrl = () => {
  // Strip /api suffix if present
  return API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
};

// Get token from AsyncStorage (used in several places)
const getToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem('token');
};

export default {
  connectSocket,
  disconnectSocket,
  onNewBookingRequest,
  isSocketConnected,
  runDiagnostics,
  testBookingNotification,
  joinChatRoom,
  sendChatMessage
}; 