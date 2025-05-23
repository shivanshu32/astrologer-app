import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_URL, SOCKET_URL, LOCAL_NETWORK_SOCKET_URL, APP_IDENTIFIER } from '../config';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

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
    return jwtDecode(token);
  } catch (error) {
    logError('Error decoding JWT token:', error);
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

// Maximum number of join attempts
const MAX_JOIN_ATTEMPTS = 3;

// Delay between join attempts (ms)
const JOIN_RETRY_DELAY = 2000;

// Timeout for join attempts (ms)
const JOIN_TIMEOUT = 10000;

// Timeout for enhanced join attempts (ms)
const ENHANCED_JOIN_TIMEOUT = 15000;

// Add missing JoinRoomResult type
interface JoinRoomResult {
  success: boolean;
  error?: string | null;
  data?: any;
}

// Improved network connectivity check function
const checkNetworkConnectivity = async (): Promise<boolean> => {
  try {
    console.log('[SOCKET] Checking network connectivity...');
    
    // Create a timeout promise
    const networkTimeout = new Promise<Response>((_, reject) => 
      setTimeout(() => reject(new Error('Network check timeout')), 5000) // Increased timeout to 5 seconds
    );
    
    // Try multiple endpoints to check connectivity
    const endpoints = [
      // First try the socket URL directly
      baseURL,
      // Then try the API URL
      API_URL,
      // Then try a simpler URL without /api
      API_URL.replace('/api', ''),
      // Finally try a public internet endpoint as fallback
      'https://www.google.com'
    ];
    
    // Try each endpoint until one succeeds
    for (const endpoint of endpoints) {
      try {
        console.log(`[SOCKET] Checking connectivity to: ${endpoint}`);
        const networkCheck = fetch(endpoint, { 
          method: 'HEAD',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        // Wait for either the fetch to complete or the timeout
        await Promise.race([networkCheck, networkTimeout]);
        console.log(`[SOCKET] Successfully connected to: ${endpoint}`);
        return true;
      } catch (endpointError) {
        console.log(`[SOCKET] Failed to connect to ${endpoint}:`, endpointError);
        // Continue to the next endpoint
      }
    }
    
    // If we get here, all endpoints failed
    console.error('[SOCKET] All connectivity checks failed');
    return false;
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
 * Get the current socket instance
 * @returns The current socket instance or null if not connected
 */
export const getSocket = () => {
  return socket;
};

/**
 * Connect to the socket server
 */
const connectSocket = async (): Promise<Socket | null> => {
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
    
    // Reset reconnect attempts
    reconnectAttempts = 0;
    
    // If already connecting, wait for that to complete
    if (isConnecting) {
      log('Already attempting to connect, waiting for that to complete...');
      for (let i = 0; i < 10; i++) { // Try up to 10 times, waiting 300ms each time
        await new Promise(resolve => setTimeout(resolve, 300));
        if (socket && isSocketConnected()) {
          return socket;
        }
      }
    }
    
    isConnecting = true;
    log(`Attempting to connect to socket server at: ${baseURL}`);
    
    // If already connected, return current socket
    if (socket?.connected) {
      log('Socket already connected, ID:', socket.id);
      return socket;
    }
    
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

    // Get the astrologer ID to ensure it's included in the connection
    const astrologerId = await getValidAstrologerId();
    if (!astrologerId) {
      logError('Could not determine astrologer ID for socket connection');
      isConnecting = false;
      return null;
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
      appIdentifier: APP_IDENTIFIER, // Use the imported constant
      astrologerId: astrologerId // Always include the astrologer ID
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
      log(`Connecting with WebSocket transport to ${baseURL}`);
      
      // Create socket with more detailed options
      socket = io(baseURL, {
        auth: authData,
        transports: ['websocket', 'polling'], // Allow fallback to polling if websocket fails
        forceNew: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: 1000,
        timeout: 20000, // Increase timeout even more
        autoConnect: true,
        reconnection: true,
        // Add more debugging info in the query
        query: {
          appType: 'astrologer-app',
          appVersion: '1.0.0',
          platform: Platform.OS,
          astrologerId: authData.astrologerId || 'unknown',
          userType: 'astrologer',
          timestamp: Date.now().toString()
        }
      });
      
      // Log when socket connection is established
      log('Socket initialized, waiting for connection...');
      
      // Log the socket options for debugging
      log(`Socket options: ${JSON.stringify({
        url: baseURL,
        transports: ['websocket'],
        auth: {
          ...authData,
          token: authData.token ? '***' : null // Hide token in logs
        }
      }, null, 2)}`);
      
      // Add more detailed error logging with retry information
      socket?.on('connect_error', (error: any) => {
        logError(`Socket connect error (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}): ${error.message}`);
        // Try to get more details about the error
        if (error.data) {
          logError(`Error data: ${JSON.stringify(error.data)}`);
        }
        
        // Emit a custom event that the app can listen for
        socket?.emit('jyotish:connection_error', {
          error: error.message,
          attempt: reconnectAttempts + 1,
          maxAttempts: MAX_RECONNECT_ATTEMPTS,
          timestamp: Date.now()
        });
      });
      
      // Add connect event handler with more detailed logging
      socket?.on('connect', () => {
        log(`Socket connected successfully after ${reconnectAttempts} retries`);
        isConnecting = false;
        
        // Emit a custom event that the app can listen for
        socket?.emit('jyotish:connected', {
          timestamp: Date.now(),
          retries: reconnectAttempts
        });
      });
      
      // Set up event handlers for the new socket
      setupSocketEventHandlers(socket);
      
      // Wait a bit to see if connection succeeds
      await new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          log('Socket connection timeout after 8 seconds');
          resolve(false); // Resolve with false if timeout occurs
        }, 8000); // Increased timeout
        
        socket?.once('connect', () => {
          clearTimeout(timeoutId);
          log('Socket connected successfully');
          resolve(true); // Resolve with true if connection succeeds
        });
        
        socket?.once('connect_error', (error) => {
          clearTimeout(timeoutId);
          logError(`Socket connect_error during initial connection: ${error.message}`);
          resolve(false); // Resolve with false if connection error occurs
        });
      });
      
      // If socket is not connected after waiting, try polling fallback
      if (!socket?.connected) {
        log('WebSocket transport failed, trying polling fallback');
        
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
      }
    } catch (socketError) {
      logError('Error creating socket:', socketError);
      isConnecting = false;
      return null;
    }

    // Return socket even if not yet connected - event handlers will handle connection
    isConnecting = false;
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
    details.push(`Local Network Socket URL: ${LOCAL_NETWORK_SOCKET_URL}`);
    
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
// Helper function to try joining a chat room with different parameters
const tryJoinChatRoom = async (params: { chatId?: string, bookingId?: string }): Promise<JoinRoomResult> => {
  const { chatId, bookingId } = params;
  
  try {
    // Skip if we have neither chat ID nor booking ID
    if (!chatId && !bookingId) {
      console.log('[SOCKET] Cannot join chat room: No chat ID or booking ID provided');
      return { success: false, error: 'No chat ID or booking ID provided' };
    }
    
    // Check network connectivity first
    console.log('[SOCKET] Checking network connectivity before attempting to join chat room...');
    const connected = await checkNetworkConnectivity();
    if (!connected) {
      console.log('[SOCKET] Network connectivity check failed, cannot join chat room');
      return { success: false, error: 'No network connectivity' };
    }

    // Connect to socket if not already connected
    const socket = await connectSocket();
    if (!socket) {
      console.log('[SOCKET] Failed to connect to socket server, cannot join chat room');
      return { success: false, error: 'Failed to connect to socket server' };
    }

    // Get astrologer ID for the payload
    const astrologerId = await getValidAstrologerId();
    if (!astrologerId) {
      console.log('[SOCKET] Failed to get valid astrologer ID, cannot join chat room');
      return { success: false, error: 'Failed to get valid astrologer ID' };
    }

    // Prepare payload for joining
    const payload: {
      chatId?: string;
      bookingId?: string;
      astrologerId: string;
      userType: string;
      timestamp?: number;
    } = {
      astrologerId,
      userType: 'astrologer',
      timestamp: Date.now() // Add timestamp to make each request unique
    };

    // Add chat ID and/or booking ID if available
    if (chatId) payload.chatId = chatId;
    if (bookingId) payload.bookingId = bookingId;

    // Helper function to get token
    const getToken = async (): Promise<string | null> => {
      try {
        const token = await AsyncStorage.getItem('token');
        return token;
      } catch (error) {
        console.error('[SOCKET] Error getting token:', error);
        return null;
      }
    };

    // Track join attempts
    let joinAttempts = 0;

    // Function to attempt socket join with retries
    const attemptSocketJoin = async (): Promise<JoinRoomResult> => {
      return new Promise((resolve) => {
        // Update attempt counter
        joinAttempts++;

        // Update timestamp for this attempt
        payload.timestamp = Date.now();

        console.log(`[SOCKET] Join attempt ${joinAttempts}/${MAX_JOIN_ATTEMPTS} for ${bookingId ? 'bookingId: ' + bookingId : 'chatId: ' + chatId}`);

        // Set up listeners for join success/failure
        const joinSuccessHandler = (data: any) => {
          console.log('[SOCKET] Successfully joined chat room:', data);
          socket.off('chat:error', joinErrorHandler);
          clearTimeout(joinTimeout);
          resolve({ success: true, data });
        };

        const joinErrorHandler = (error: any) => {
          console.log('[SOCKET] Error joining chat room:', error);
          socket.off('chat:joined', joinSuccessHandler);
          clearTimeout(joinTimeout);

          // If we have more attempts, retry
          if (joinAttempts < MAX_JOIN_ATTEMPTS) {
            console.log(`[SOCKET] Retrying join after error (attempt ${joinAttempts}/${MAX_JOIN_ATTEMPTS})`);
            setTimeout(() => {
              // Remove old listeners before retrying
              socket.off('chat:joined', joinSuccessHandler);
              socket.off('chat:error', joinErrorHandler);

              // Retry the join attempt
              attemptSocketJoin().then(resolve);
            }, JOIN_RETRY_DELAY);
          } else {
            // No more retries, return error
            resolve({ success: false, error: error?.message || 'Failed to join chat room after multiple attempts' });
          }
        };

        // Register event handlers
        socket.once('chat:joined', joinSuccessHandler);
        socket.once('chat:error', joinErrorHandler);

        // Make sure the socket is connected before emitting
        if (!socket.connected) {
          console.log('[SOCKET] Socket not connected, waiting for connection before joining chat room...');

          // Set up a connection listener
          socket.once('connect', () => {
            console.log('[SOCKET] Socket connected, proceeding with chat room join');
            // Emit the join event once connected
            socket.emit('chat:join', payload);
            
            // Log the exact payload sent
            console.log('[SOCKET] Emitted chat:join with payload:', JSON.stringify(payload, null, 2));
          });

          // Try to reconnect the socket with a more aggressive approach
          try {
            socket.io.opts.transports = ['websocket', 'polling']; // Allow both transport methods
            socket.io.opts.timeout = 20000; // Increase timeout
            socket.connect();
            
            console.log('[SOCKET] Initiated socket reconnection with updated parameters');
          } catch (err) {
            console.error('[SOCKET] Error during socket reconnection:', err);
          }
        } else {
          // Socket already connected, emit join event
          socket.emit('chat:join', payload);
          
          // Log the exact payload sent
          console.log('[SOCKET] Emitted chat:join with payload:', JSON.stringify(payload, null, 2));
        }

        // Log that we've sent the join request
        console.log(`[SOCKET] Sent chat:join request:`, JSON.stringify(payload, null, 2));

        // Add a safety timeout in case neither success nor error events fire
        const joinTimeout = setTimeout(() => {
          console.log(`[SOCKET] Join attempt ${joinAttempts} timed out`);
          socket.off('chat:joined', joinSuccessHandler);
          socket.off('chat:error', joinErrorHandler);

          // If we have more attempts, retry
          if (joinAttempts < MAX_JOIN_ATTEMPTS) {
            console.log(`[SOCKET] Retrying join after timeout (attempt ${joinAttempts}/${MAX_JOIN_ATTEMPTS})`);
            setTimeout(() => attemptSocketJoin().then(resolve), JOIN_RETRY_DELAY);
          } else {
            // No more retries, return error
            resolve({ success: false, error: 'Join chat room timeout after multiple attempts' });
          }
        }, 10000); // 10 seconds timeout per attempt
      });
    };

    // First try HTTP API approach for more reliable joining if we have a chatId
    if (chatId) {
      console.log('[SOCKET] Attempting to join chat room via HTTP API first');
      try {
        // Construct URL with proper base
        const baseApiUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
        const joinUrl = `${baseApiUrl}/chats/${chatId}/join`.replace('/api/api/', '/api/');

        console.log(`[SOCKET] Making HTTP request to: ${joinUrl}`);

        // Get token
        const authToken = await getToken();
        if (!authToken) {
          console.log('[SOCKET] No auth token available for HTTP join');
          // Fall back to socket join
          return await attemptSocketJoin();
        }

        // Try using axios for more reliable HTTP requests
        try {
          console.log('[SOCKET] Attempting HTTP join with axios');
          const axiosResponse = await axios.post(
            joinUrl,
            payload,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'X-App-Identifier': APP_IDENTIFIER,
                'X-Astrologer-Id': astrologerId
              },
              timeout: 15000 // 15 second timeout
            }
          );
          
          if (axiosResponse.status >= 200 && axiosResponse.status < 300) {
            if (axiosResponse.data?.success) {
              // HTTP join successful with axios
              console.log('[SOCKET] Successfully joined chat room via HTTP (axios)');
              return { success: true, data: axiosResponse.data };
            }
          }
          
          console.log(`[SOCKET] Axios HTTP join failed with status: ${axiosResponse.status}`);
        } catch (axiosError) {
          console.log('[SOCKET] Axios HTTP join error:', axiosError);
          // Continue to try fetch as fallback
        }

        // Fallback to fetch if axios fails
        console.log('[SOCKET] Falling back to fetch for HTTP join');
        const response = await fetch(joinUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'X-App-Identifier': APP_IDENTIFIER,
            'X-Astrologer-Id': astrologerId
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          if (data?.success) {
            // HTTP join successful
            console.log('[SOCKET] Successfully joined chat room via HTTP (fetch)');
            return { success: true, data };
          }
        }

        console.log(`[SOCKET] HTTP chat join failed with status: ${response.status}`);
        // Fall back to socket join
        return await attemptSocketJoin();
      } catch (httpError) {
        console.log('[SOCKET] HTTP join attempt failed:', httpError);
        // Fall back to socket join
        return await attemptSocketJoin();
      }
    } else {
      // For bookingId, just use socket directly
      return await attemptSocketJoin();
    }
  } catch (error) {
    console.error('[SOCKET ERROR] Error in tryJoinChatRoom:', error);
    return { success: false, error: 'Unknown error joining chat room' };
  }
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
    retryDelay = JOIN_RETRY_DELAY,
    onProgress = (status: string) => console.log(`[SOCKET] Join progress: ${status}`)
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
        return { 
          success: false, 
          error: 'No network connectivity available' 
        };
      }
      
      // Try to join the chat room with multiple attempts
      onProgress('Attempting to join chat room');
      
      // Try multiple strategies to join the room
      // 1. First try with both IDs
      if (chatId && bookingId) {
        onProgress('Trying to join with both chat ID and booking ID');
        const bothIdsResult = await joinChatRoom(chatId, bookingId);
        if (bothIdsResult.success) {
          return bothIdsResult;
        }
        onProgress('Failed to join with both IDs, trying alternatives...');
      }
      
      // 2. Try with just chat ID if available
      if (chatId) {
        onProgress('Trying to join with chat ID only');
        const chatIdResult = await joinChatRoom(chatId, '');
        if (chatIdResult.success) {
          return chatIdResult;
        }
        onProgress('Failed to join with chat ID only');
      }
      
      // 3. Try with just booking ID if available
      if (bookingId) {
        onProgress('Trying to join with booking ID only');
        const bookingIdResult = await joinChatRoom('', bookingId);
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

/**
 * Joins a chat room using either chatId or bookingId
 * Handles retries and network connectivity checks
 */
const joinChatRoom = async (chatId: string = '', bookingId: string = ''): Promise<JoinRoomResult> => {
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
    
    // First try with both IDs if available
    if (chatId && bookingId) {
      console.log('[SOCKET] Trying to join with both chat ID and booking ID');
      const result = await tryJoinChatRoom({ chatId, bookingId });
      if (result.success) {
        joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: true });
        return result;
      }
      console.log('[SOCKET] Failed to join with both IDs, trying with chat ID only');
    }
    
    // If we have a chat ID, try with that alone
    if (chatId) {
      console.log('[SOCKET] Trying to join using chat ID only:', chatId);
      const result = await tryJoinChatRoom({ chatId });
      if (result.success) {
        joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: true });
        return result;
      }
      console.log('[SOCKET] Failed to join with chat ID, trying with booking ID only');
    }
    
    // Last resort: try with booking ID only
    if (bookingId) {
      console.log('[SOCKET] Trying to join using booking ID only:', bookingId);
      const result = await tryJoinChatRoom({ bookingId });
      if (result.success) {
        joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: true });
        return result;
      }
      console.log('[SOCKET] Failed to join using booking ID');
    }
    
    // If all attempts failed, return failure
    console.error('[SOCKET ERROR] All join attempts failed');
    joinedRooms.set(roomCacheKey, { timestamp: Date.now(), success: false });
    return { success: false, error: 'Failed to join chat room after multiple attempts' };
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
    // Check if we have a network connection first
    try {
      log('Checking network connectivity before sending message...');
      const networkTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network check timeout')), 3000)
      );
      
      const networkCheck = fetch(API_URL, { 
        method: 'HEAD',
        cache: 'no-store' 
      });
      
      await Promise.race([networkCheck, networkTimeout]);
      log('Network connectivity confirmed for message send');
    } catch (networkError) {
      logError('Network connectivity issue detected:', networkError);
      return { success: false, error: 'Network connectivity issue' };
    }
    
    // Get authenticated astrologer ID
    let authenticatedAstrologerId = senderId;
    if (!authenticatedAstrologerId) {
      try {
        const astrologerId = await getValidAstrologerId();
        authenticatedAstrologerId = astrologerId || undefined;
        if (!authenticatedAstrologerId) {
          // Try to extract from token
          const token = await AsyncStorage.getItem('token');
          if (token) {
            const decodedToken = decodeJwt(token);
            if (decodedToken && typeof decodedToken === 'object' && 'id' in decodedToken) {
              authenticatedAstrologerId = decodedToken.id as string;
              log(`Extracted astrologerId from token: ${authenticatedAstrologerId}`);
            }
          }
        }
      } catch (e) {
        logError('Error getting authenticated astrologer ID:', e);
      }
    }
    
    if (!authenticatedAstrologerId) {
      return { success: false, error: 'Could not determine astrologer ID' };
    }
    
    // First try sending message via HTTP API
    try {
      log(`Attempting to send message via HTTP API first (bookingId: ${bookingId})`);
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        log('No token available for HTTP message send');
        throw new Error('Authentication token not available');
      }
      
      // Prepare message payload
      const messagePayload = {
        chatId,
        bookingId,
        message,
        astrologerId: authenticatedAstrologerId,
        userType: 'astrologer'
      };
      
      // Use axios to send the message via HTTP API
      const response = await axios.post(
        `${API_URL}/chats/messages`,
        messagePayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      log(`Message sent successfully via HTTP API: ${JSON.stringify(response.data)}`);
      return { 
        success: true,
        messageId: response.data?.message?._id || response.data?.messageId 
      };
    } catch (httpError) {
      log(`HTTP API message send failed: ${httpError}`);
      // Continue with socket method if HTTP fails
    }
    
    // If HTTP API failed, try socket
    if (!socket?.connected) {
      log('Socket not connected - attempting to connect before sending message');
      await connectSocket();
      
      // If still not connected after attempt, return failure
      if (!socket?.connected) {
        logError('Failed to connect socket for sending message');
        return { success: false, error: 'Socket connection failed' };
      }
    }
    
    // Safety check: Make sure socket exists at this point
    if (!socket) {
      logError('Socket is still null after connection attempt - cannot send message');
      return { success: false, error: 'Socket is null' };
    }
    
    // Make sure we are in the chat room first
    log(`Ensuring we are in chat room ${chatId} before sending message`);
    const joinResult = await joinChatRoom(chatId, bookingId);
    
    if (!joinResult.success) {
      logError(`Failed to join chat room ${chatId} before sending message`);
      return { success: false, error: 'Failed to join chat room' };
    }
    
    log(`Sending message to chat ${chatId}`);
    
    // Create a promise that resolves on successful send or rejects on error/timeout
    return new Promise((resolve) => {
      let isResolved = false;
      
      if (!socket) {
        // Double check that socket still exists
        logError('Socket became null - cannot send message');
        isResolved = true;
        resolve({ success: false, error: 'Socket became null' });
        return;
      }

      // Remove any existing message-related listeners to avoid duplicates
      socket.off('chat:messageSent');
      socket.off('chat:error');
      
      // Set up one-time event listeners for this specific send attempt
      const onMessageSent = (data: any) => {
        if (data.chatId === chatId) {
          log(`Message sent successfully to chat: ${chatId}`);
          cleanup();
          if (!isResolved) {
            isResolved = true;
            resolve({ success: true, messageId: data?.messageId || Date.now().toString() });
          }
        }
      };
      
      const onError = (data: any) => {
        if (data?.message && (data.message.includes('send') || data.message.includes('message'))) {
          logError(`Failed to send message: ${data.message}`);
          cleanup();
          if (!isResolved) {
            isResolved = true;
            resolve({ success: false, error: data.message });
          }
        }
      };
      
      const cleanup = () => {
        if (socket) {
          socket.off('chat:messageSent', onMessageSent);
          socket.off('chat:error', onError);
        }
      };
      
      // Add temporary listeners
      socket.on('chat:messageSent', onMessageSent);
      socket.on('chat:error', onError);
      
      // Prepare the message payload
      const payload = {
        chatId,
        bookingId,
        message,
        astrologerId: authenticatedAstrologerId,
        senderType: 'astrologer',
        timestamp: Date.now()
      };
      
      // Send the message
      if (socket?.connected) {
        log('Sending message with payload:', payload);
        socket.emit('chat:sendMessage', payload);
      } else {
        cleanup();
        if (!isResolved) {
          isResolved = true;
          resolve({ success: false, error: 'Socket disconnected before sending' });
        }
      }
      
      // Set timeout to prevent hanging - increased to 10 seconds
      setTimeout(() => {
        if (!isResolved) {
          cleanup();
          logError('Message send operation timed out');
          isResolved = true;
          resolve({ success: false, error: 'Message send operation timed out' });
        }
      }, 10000); // Increased from 5000 to 10000
    });
  } catch (error: any) {
    logError('Error in sendChatMessage:', error);
    return { success: false, error: String(error) };
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



/**
 * Check if the socket is in a specific room
 * @param roomId The room ID to check
 * @returns Promise that resolves to true if socket is in the room, false otherwise
 */
const isSocketInRoom = async (roomId: string): Promise<boolean> => {
  if (!roomId) return false;
  
  try {
    // First check if socket is connected
    if (!isSocketConnected()) {
      log(`Socket is not connected, cannot be in room ${roomId}`);
      return false;
    }
    
    // Get the socket instance
    const socketInstance = socket;
    if (!socketInstance) {
      log(`No socket instance available to check room ${roomId}`);
      return false;
    }
    
    // Check if the socket has joined the room
    // This is a bit of a hack since socket.io doesn't expose a direct way to check
    // We'll emit a special event and have the server respond with room membership
    return new Promise((resolve) => {
      // Set a timeout in case the server doesn't respond
      const timeout = setTimeout(() => {
        log(`Timeout waiting for room check response for ${roomId}`);
        resolve(false);
      }, 3000);
      
      // Listen for the response
      socketInstance.once('room_check_response', (response: {inRoom: boolean, roomId: string}) => {
        clearTimeout(timeout);
        log(`Room check response for ${roomId}: ${response.inRoom}`);
        resolve(response.inRoom && response.roomId === roomId);
      });
      
      // Emit the check event
      socketInstance.emit('check_room', { roomId });
    });
  } catch (error) {
    logError(`Error checking if socket is in room ${roomId}: ${error}`);
    return false;
  }
};

// Export all functions
export { 
  enhancedJoinChatRoom, 
  joinChatRoom, 
  checkNetworkConnectivity, 
  connectSocket,
  isSocketInRoom
  // getSocket is already exported above
};

// Default export for backward compatibility
export default {
  connectSocket,
  disconnectSocket,
  onNewBookingRequest,
  isSocketConnected,
  runDiagnostics,
  testBookingNotification,
  enhancedJoinChatRoom,
  joinChatRoom,
  sendChatMessage
}; 