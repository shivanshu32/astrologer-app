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
  acceptBooking: (bookingId: string) => Promise<void>;
  rejectBooking: (bookingId: string, reason?: string) => Promise<void>;
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

  // Fetch pending booking requests (only called on initial load and manual refresh)
  const refreshBookingRequests = async () => {
    try {
      if (isDev) console.log('Fetching pending booking requests...');
      setIsLoading(true);
      
      const requests = await bookingRequestService.getMyBookingRequests();
      
      if (isDev) console.log(`Received ${requests.length} booking requests from API`);
      
      // Filter only pending requests and sort by newest first
      const pendingRequests = requests
        .filter(req => req.status === 'pending')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      if (isDev) console.log(`Found ${pendingRequests.length} pending booking requests`);
      
      // Check if the list has actually changed before updating lastUpdated
      const hasChanged = checkIfRequestsChanged(pendingRequests, recentBookingRequests);
      
      if (isDev) {
        if (hasChanged) {
          console.log('Booking requests list has changed, updating state');
        } else {
          console.log('No changes detected in booking requests list');
        }
      }
      
      // Update the recent requests list (only if changed, to avoid unnecessary re-renders)
      if (hasChanged || recentBookingRequests.length === 0) {
        setRecentBookingRequests(pendingRequests);
      }
      
      // Only update lastUpdated if there was an actual change or it's the first load
      // This is critical to avoid triggering useless refresh cycles
      if (hasChanged || lastUpdated === null) {
        const newUpdateTime = new Date();
        if (isDev) console.log(`Setting lastUpdated to: ${newUpdateTime.toISOString()}`);
        setLastUpdated(newUpdateTime);
      } else if (isDev) {
        console.log('Skipping lastUpdated update since nothing changed');
      }
      
      return pendingRequests;
    } catch (error) {
      console.error('Error fetching booking requests:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Helper function to check if the booking requests list has changed
  const checkIfRequestsChanged = (newRequests: BookingRequest[], oldRequests: BookingRequest[]): boolean => {
    // Quick length check first
    if (newRequests.length !== oldRequests.length) {
      return true;
    }
    
    // Compare IDs (assumes lists are sorted the same way)
    const newIds = new Set(newRequests.map(req => req._id));
    const oldIds = new Set(oldRequests.map(req => req._id));
    
    // Check if all new IDs are in old set and vice versa
    if (newIds.size !== oldIds.size) {
      return true;
    }
    
    for (const id of newIds) {
      if (!oldIds.has(id)) {
        return true;
      }
    }
    
    return false;
  };

  // Fetch full booking details when we receive a notification
  const fetchBookingDetails = async (bookingId: string) => {
    try {
      if (isDev) console.log(`Fetching details for booking request: ${bookingId}`);
      
      // Add retry logic
      let booking = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!booking && attempts < maxAttempts) {
        attempts++;
        try {
          booking = await bookingRequestService.getBookingRequestById(bookingId);
          if (isDev) console.log(`Attempt ${attempts}: ${booking ? 'Success' : 'Failed'}`);
          
          if (!booking && attempts < maxAttempts) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (retryError) {
          console.error(`Error on attempt ${attempts}:`, retryError);
          if (attempts < maxAttempts) {
            // Wait longer before retrying
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      }
      
      if (isDev) console.log('Booking details received:', booking ? 'yes' : 'no');
      
      if (!booking) {
        console.error(`No booking found with ID: ${bookingId} after ${attempts} attempts`);
        
        // Check if the socket is still connected
        const socketStatus = isSocketConnected();
        console.log(`Socket connection status during fetch failure: ${socketStatus ? 'connected' : 'disconnected'}`);
        
        // Create a placeholder if needed for testing
        if (isDev && bookingId.startsWith('test-')) {
          console.log('Creating test booking placeholder for UI testing');
          booking = {
            _id: bookingId,
            userId: { 
              _id: 'test-user',
              name: 'Test User',
              mobileNumber: '1234567890'
            },
            astrologerId: 'test-astrologer',
            status: 'pending' as 'pending',
            consultationType: 'chat' as 'chat',
            amount: 500,
            notes: 'This is a test booking request',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          } as BookingRequest;
        } else {
          return;
        }
      }
      
      // Only show popup for pending requests
      if (booking.status === 'pending') {
        // Set as active booking request for popup
        setActiveBookingRequest(booking);
        
        // Also add to recent requests list if not already there
        setRecentBookingRequests(prev => {
          // Check if already in the list
          if (prev.some(req => req._id === booking._id)) {
            if (isDev) console.log('Booking already in recent requests list');
            return prev;
          }
          // Add to the beginning of the list
          if (isDev) console.log('Adding booking to recent requests list');
          return [booking, ...prev];
        });
        
        if (isDev) console.log('Booking details retrieved and notification set');
      } else {
        if (isDev) console.log(`Booking status is ${booking.status}, not showing popup`);
      }
    } catch (error) {
      console.error('Error fetching booking details:', error);
    }
  };

  // Accept booking request
  const acceptBooking = async (bookingId: string) => {
    try {
      setIsLoading(true);
      await bookingRequestService.acceptBookingRequest(bookingId);
      
      // Dismiss popup if it's the active booking
      if (activeBookingRequest && activeBookingRequest._id === bookingId) {
        setActiveBookingRequest(null);
      }
      
      // Remove from recent requests
      setRecentBookingRequests(prev => 
        prev.filter(req => req._id !== bookingId)
      );
    } catch (error) {
      console.error('Error accepting booking:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Reject booking request
  const rejectBooking = async (bookingId: string, reason?: string) => {
    try {
      setIsLoading(true);
      await bookingRequestService.rejectBookingRequest(bookingId, reason);
      
      // Dismiss popup if it's the active booking
      if (activeBookingRequest && activeBookingRequest._id === bookingId) {
        setActiveBookingRequest(null);
      }
      
      // Remove from recent requests
      setRecentBookingRequests(prev => 
        prev.filter(req => req._id !== bookingId)
      );
    } catch (error) {
      console.error('Error rejecting booking:', error);
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