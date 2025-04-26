import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_URL, LOCAL_NETWORK_API_URL } from '../config';

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

// Connect to socket
export const connectSocket = async (): Promise<Socket | null> => {
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
    } = {
      token,
      // Add explicit astrologer type for this app - backend will use this if token doesn't specify
      userType: 'astrologer',
      appIdentifier: 'astrologer-app'
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
          log(`Including mobile number in socket auth: ${userData.mobileNumber || userData.mobile}`);
          authData.mobileNumber = userData.mobileNumber || userData.mobile;
        }
        
        // Add email to auth data for easier identification
        if (userData.email) {
          log(`Including email in socket auth: ${userData.email}`);
          authData.email = userData.email;
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

    // Connect with authentication
    log(`Connecting to socket at ${baseURL} with auth:`, authData);
    socket = io(baseURL, {
      auth: authData,
      transports: ['websocket'],
      forceNew: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      timeout: 10000,
      query: {
        // Add additional query parameters for identification
        appType: 'astrologer-app',
        appVersion: '1.0.0',
        platform: Platform.OS
      }
    });

    // Log connection attempt
    log('Socket instance created, connecting...');

    // Setup event handlers before connection is established
    socket.on('connect_error', (error) => {
      logError(`Socket connection error: ${error.message}`, error);
      if (error.message.includes('jwt')) {
        logError('JWT authentication error detected. Token may be invalid or expired.');
      }
      isConnecting = false;
      reconnectSocket();
    });

    // Setup event listeners
    socket.on('connect', () => {
      log(`Socket connected successfully, ID: ${socket?.id}`);
      isConnecting = false;
      reconnectAttempts = 0;
      
      // Debug: Emit a test event to verify connection
      log('Sending test connection event');
      socket?.emit('test-connection', { clientTime: new Date().toISOString() });
    });

    // Add handler for welcome message from server
    socket.on('welcome', (data) => {
      log('Received welcome message from server:', data);
      // This indicates the server has successfully authenticated us
    });

    socket.on('disconnect', (reason) => {
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

    socket.on('error', (error) => {
      logError('Socket error:', error);
      isConnecting = false;
    });

    // Listen for new booking requests
    socket.on('new-booking-request', (data) => {
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
        log('Socket connection state:', socket?.connected ? 'connected' : 'disconnected');
        
        // Force refresh the UI by dispatching an event to the document
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new Event('booking-notification-received'));
        }
        
        // Try to ping back to confirm receipt (helps debug bidirectional issues)
        if (socket) {
          socket.emit('booking-notification-received', { 
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
    
    // Add a test event to verify server communication
    socket.on('test-response', (data) => {
      log('Received test response from server:', data);
    });

    return socket;
  } catch (error) {
    logError('Error connecting to socket:', error);
    isConnecting = false;
    return null;
  }
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

// Check if socket is connected
export const isSocketConnected = (): boolean => {
  return socket?.connected || false;
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

export default {
  connectSocket,
  disconnectSocket,
  onNewBookingRequest,
  isSocketConnected,
  runDiagnostics,
  testBookingNotification
}; 