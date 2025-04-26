import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onNewBookingRequest, connectSocket, disconnectSocket, isSocketConnected } from '../services/socketService';
import bookingRequestService, { BookingRequest } from '../services/bookingRequestService';
import { Platform } from 'react-native';

// Only log in development mode
const isDev = __DEV__;

type BookingNotificationContextType = {
  activeBookingRequest: BookingRequest | null;
  recentBookingRequests: BookingRequest[];
  isLoading: boolean;
  acceptBooking: (bookingId: string) => Promise<BookingRequest>;
  rejectBooking: (bookingId: string, reason?: string) => Promise<BookingRequest>;
  dismissNotification: () => void;
  refreshBookingRequests: () => Promise<BookingRequest[]>;
  socketConnected: boolean;
  handleLogout: () => void;
  lastUpdated: Date | null;
};

const BookingNotificationContext = createContext<BookingNotificationContextType | undefined>(undefined);

export const BookingNotificationProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(null);
  const [activeBookingRequest, setActiveBookingRequest] = useState<BookingRequest | null>(null);
  const [recentBookingRequests, setRecentBookingRequests] = useState<BookingRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Flag to prevent multiple initial fetches
  const hasInitiallyFetched = useRef<boolean>(false);
  // Track socket notification handler
  const listenerRef = useRef<(() => void) | null>(null);

  // Check authentication status directly
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('token');
        setIsAuthenticated(!!storedToken);
        setToken(storedToken);
      } catch (error) {
        if (isDev) console.error('Error checking auth:', error);
      }
    };
    
    checkAuth();
  }, []);

  // Connect to socket when authenticated
  useEffect(() => {
    let socketCheckInterval: NodeJS.Timeout | null = null;
    
    const setupSocket = async () => {
      if (isAuthenticated && token) {
        if (isDev) console.log('Setting up socket connection...');
        try {
          const socket = await connectSocket();
          
          if (socket) {
            setSocketConnected(true);
            if (isDev) console.log('Socket connected successfully');
            
            // Load initial pending booking requests ONLY ONCE after login
            if (!hasInitiallyFetched.current) {
              refreshBookingRequests();
              hasInitiallyFetched.current = true;
            }
            
            // Set up interval to check socket connection status
            socketCheckInterval = setInterval(() => {
              const connected = isSocketConnected();
              
              // Only update state if connection status has changed
              if (socketConnected !== connected) {
                setSocketConnected(connected);
                
                if (!connected && isDev) {
                  console.log('Socket disconnected, attempting to reconnect...');
                  connectSocket();
                }
              }
            }, 30000); // Check every 30 seconds
          }
        } catch (error) {
          if (isDev) console.error('Error setting up socket:', error);
        }
      } else {
        disconnectSocket();
        setSocketConnected(false);
        // Reset fetch flag on logout
        hasInitiallyFetched.current = false;
      }
    };

    setupSocket();

    // Cleanup on unmount
    return () => {
      if (socketCheckInterval) {
        clearInterval(socketCheckInterval);
      }
      disconnectSocket();
      setSocketConnected(false);
    };
  }, [isAuthenticated, token]);

  // Listen for new booking requests
  useEffect(() => {
    if (!isAuthenticated) return;

    if (isDev) console.log('Setting up booking request socket listener');
    
    // Clean up previous listener if it exists
    if (listenerRef.current) {
      listenerRef.current();
      listenerRef.current = null;
    }
    
    try {
      // Register listener for new booking requests
      const removeListener = onNewBookingRequest((bookingData) => {
        if (isDev) {
          console.log('🔔 Received new booking request via socket:', bookingData._id);
          console.log('Booking data:', JSON.stringify(bookingData, null, 2));
        }
        
        try {
          // Set the last updated timestamp
          setLastUpdated(new Date());
          
          // Force UI update
          if (bookingData && bookingData._id) {
            // Fetch complete booking data
            fetchBookingDetails(bookingData._id);
            
            // Play sound if on mobile
            playNotificationSound();
          } else {
            console.error('Received invalid booking data:', bookingData);
          }
        } catch (error) {
          console.error('Error processing booking notification:', error);
        }
      });
      
      // Save the listener removal function
      listenerRef.current = removeListener;
      
      if (isDev) console.log('Successfully registered booking request listener');
      
      // Send a test ping to check connection
      setTimeout(() => {
        console.log('Checking socket connection status after listener setup:', isSocketConnected());
      }, 1000);
    } catch (error) {
      console.error('Error setting up booking request listener:', error);
    }

    // Cleanup listener
    return () => {
      if (isDev) console.log('Removing booking request socket listener');
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, [isAuthenticated]);

  // Simple function to play a notification sound
  const playNotificationSound = () => {
    try {
      // Only attempt on native platforms
      if (Platform.OS !== 'web') {
        // This would need a proper sound implementation
        // For a real implementation, use something like expo-av
        if (isDev) console.log('Would play notification sound here');
      }
    } catch (error) {
      if (isDev) console.error('Error playing sound:', error);
    }
  };

  // Fetch booking requests (called on initial load and manual refresh)
  const refreshBookingRequests = async () => {
    try {
      if (isDev) console.log('Fetching booking requests...');
      setIsLoading(true);
      
      // Get all booking requests instead of just pending ones
      const requests = await bookingRequestService.getMyBookingRequests();
      
      if (isDev) console.log(`Received ${requests.length} booking requests from API`);
      
      // Update the last updated timestamp
      const newUpdateTime = new Date();
      if (isDev) console.log(`Setting lastUpdated to: ${newUpdateTime.toISOString()}`);
      setLastUpdated(newUpdateTime);
      
      return requests;
    } catch (error) {
      console.error('Error fetching booking requests:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch full booking details when we receive a notification
  const fetchBookingDetails = async (bookingId: string) => {
    try {
      // First try to find it in recently fetched requests
      let existingRequest = recentBookingRequests.find(req => req._id === bookingId);
      
      // If not found locally, fetch from API
      if (!existingRequest) {
        try {
          // Get all booking requests since the specific booking isn't found locally
          const updatedRequests = await bookingRequestService.getMyBookingRequests();
          
          // Find the specific request in the updated list
          existingRequest = updatedRequests.find(req => req._id === bookingId);
          
          if (existingRequest) {
            // Update the recent requests list with all requests
            setRecentBookingRequests(updatedRequests);
          }
        } catch (error) {
          console.error('Error fetching booking by ID:', error);
        }
      }
      
      if (existingRequest) {
        setActiveBookingRequest(existingRequest);
        
        // Filter only pending requests to show the count
        const pendingRequests = recentBookingRequests.filter(req => req.status === 'pending');
        if (isDev) console.log(`Updated booking notification, now showing: ${pendingRequests.length} pending requests`);
      } else {
        console.error(`Could not find booking request with ID: ${bookingId}`);
      }
    } catch (error) {
      console.error('Error fetching booking details:', error);
    }
  };

  // Accept a booking request
  const acceptBooking = async (bookingId: string) => {
    try {
      setIsLoading(true);
      const updatedBooking = await bookingRequestService.acceptBookingRequest(bookingId);
      
      // Refresh the list
      await refreshBookingRequests();
      
      // Clear the active notification
      dismissNotification();
      
      return updatedBooking;
    } catch (error) {
      console.error('Error accepting booking:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Reject a booking request
  const rejectBooking = async (bookingId: string, reason?: string) => {
    try {
      setIsLoading(true);
      const updatedBooking = await bookingRequestService.declineBookingRequest(bookingId, reason);
      
      // Refresh the list
      await refreshBookingRequests();
      
      // Clear the active notification
      dismissNotification();
      
      return updatedBooking;
    } catch (error) {
      console.error('Error rejecting booking:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Dismiss notification
  const dismissNotification = () => {
    setActiveBookingRequest(null);
  };

  // Add a method to properly handle logout
  const handleLogout = () => {
    // First disconnect the socket
    disconnectSocket();
    
    // Clear booking data
    setActiveBookingRequest(null);
    setRecentBookingRequests([]);
    
    // Update state
    setSocketConnected(false);
    setIsAuthenticated(false);
    setToken(null);
    
    // Reset the initial fetch flag
    hasInitiallyFetched.current = false;
    
    if (isDev) console.log('[BookingNotificationContext] Logout completed, socket disconnected and data cleared');
  };

  return (
    <BookingNotificationContext.Provider
      value={{
        activeBookingRequest,
        recentBookingRequests,
        isLoading,
        acceptBooking,
        rejectBooking,
        dismissNotification,
        refreshBookingRequests,
        socketConnected,
        handleLogout,
        lastUpdated
      }}
    >
      {children}
    </BookingNotificationContext.Provider>
  );
};

export const useBookingNotification = () => {
  const context = useContext(BookingNotificationContext);
  if (context === undefined) {
    throw new Error('useBookingNotification must be used within a BookingNotificationProvider');
  }
  return context;
}; 