import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  RefreshControl,
  Alert,
  ActivityIndicator,
  Animated,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookingRequest, bookingRequestService } from '../services/bookingRequestService';
import { formatDate } from '../utils/dateUtils';
import { useBookingNotification } from '../contexts/BookingNotificationContext';

type BookingRequestsScreenProps = NativeStackNavigationProp<any>;

const BookingRequestsScreen = () => {
  const navigation = useNavigation<BookingRequestsScreenProps>();
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [newRequestIndicator, setNewRequestIndicator] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastRequestCountRef = useRef<number>(0);
  const isMounted = useRef(false);
  const isRefreshingRef = useRef(false);
  const lastHandledUpdateRef = useRef<Date | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);
  
  // Use notification context for socket status and refreshing
  const { socketConnected, refreshBookingRequests: contextRefresh, lastUpdated } = useBookingNotification();

  // Function to handle refresh with debouncing
  const debouncedRefresh = useCallback(() => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
    const MIN_REFRESH_INTERVAL = 3000; // Minimum 3 seconds between refreshes
    
    // If we've refreshed recently, debounce the refresh
    if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL) {
      console.log(`Debouncing refresh (${timeSinceLastRefresh}ms since last refresh)`);
      
      // Clear any existing timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      // Set a new timeout
      refreshTimeoutRef.current = setTimeout(() => {
        console.log('Executing debounced refresh');
        loadBookingRequests();
      }, MIN_REFRESH_INTERVAL - timeSinceLastRefresh);
      
      return;
    }
    
    // Otherwise, refresh immediately
    loadBookingRequests();
  }, []);

  // Animation for new request indicator
  const pulseAnimation = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true
      }),
      Animated.timing(fadeAnim, {
        toValue: 0.3,
        duration: 500,
        useNativeDriver: true
      })
    ]).start(() => {
      if (newRequestIndicator) {
        pulseAnimation();
      }
    });
  };

  // Start animation when indicator changes
  useEffect(() => {
    if (newRequestIndicator) {
      pulseAnimation();
    }
  }, [newRequestIndicator]);

  const loadBookingRequests = useCallback(async () => {
    // Don't refresh if already refreshing
    if (isRefreshingRef.current) {
      console.log('Already refreshing, skipping duplicate call');
      return;
    }
    
    try {
      lastRefreshTimeRef.current = Date.now();
      isRefreshingRef.current = true;
      
      console.log('BookingRequestsScreen: Loading booking requests...');
      setLoading(true);
      
      // Use context refresh function to ensure consistency
      const requests = await contextRefresh();
      
      // Get only pending requests
      const pendingRequests = requests.filter(req => req.status === 'pending');
      
      console.log(`BookingRequestsScreen: Loaded ${pendingRequests.length} pending requests`);
      
      // Check if we have new requests
      if (isMounted.current && lastRequestCountRef.current < pendingRequests.length) {
        console.log('New requests detected!');
        setNewRequestIndicator(true);
        
        // Auto-dismiss indicator after 5 seconds
        setTimeout(() => {
          setNewRequestIndicator(false);
        }, 5000);
      }
      
      // Store the current count
      lastRequestCountRef.current = pendingRequests.length;
      
      setBookingRequests(pendingRequests);
      
      // Store the current update timestamp
      if (lastUpdated) {
        lastHandledUpdateRef.current = new Date(lastUpdated.getTime());
        console.log(`Updated lastHandledUpdateRef to: ${lastHandledUpdateRef.current.toISOString()}`);
      }
    } catch (error) {
      console.error('Error loading booking requests:', error);
      Alert.alert(
        'Error',
        'Failed to load booking requests. Please try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
      
      // Clear the refreshing flag
      setTimeout(() => {
        console.log('Clearing isRefreshingRef flag');
        isRefreshingRef.current = false;
      }, 1000);
    }
  }, [contextRefresh]);

  // When the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      debouncedRefresh();
      
      return () => {
        // Clear any pending timeouts when screen loses focus
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
      };
    }, [debouncedRefresh])
  );

  // When component mounts
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Clear any pending refresh timeouts
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  // Watch for lastUpdated changes from context
  useEffect(() => {
    // Skip if there's no lastUpdated value
    if (!lastUpdated) {
      return;
    }
    
    // Skip if component is not mounted
    if (!isMounted.current) {
      console.log('Component not mounted, skipping refresh');
      return;
    }
    
    // Skip if already in a refresh cycle
    if (isRefreshingRef.current) {
      console.log('Already refreshing, skipping additional refresh trigger');
      return;
    }
    
    // Compare with last handled timestamp
    const isNewUpdate = !lastHandledUpdateRef.current || 
                         lastUpdated.getTime() > lastHandledUpdateRef.current.getTime();
    
    if (isNewUpdate) {
      console.log(`BookingRequestsScreen: Detected new update at ${lastUpdated.toISOString()}`);
      console.log(`Last handled: ${lastHandledUpdateRef.current ? lastHandledUpdateRef.current.toISOString() : 'none'}`);
      console.log('Triggering refresh...');
      debouncedRefresh(); // Use debounced refresh here instead
    } else {
      console.log('Update already handled, skipping refresh');
    }
  }, [lastUpdated, debouncedRefresh]);

  const handleRefresh = () => {
    setRefreshing(true);
    setNewRequestIndicator(false);
    debouncedRefresh(); // Use debounced refresh here
  };

  const handleAccept = async (id: string) => {
    Alert.alert(
      'Accept Request',
      'Are you sure you want to accept this booking request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              setProcessingId(id);
              await bookingRequestService.acceptBookingRequest(id);
              loadBookingRequests(); // Refresh the list
              Alert.alert('Success', 'Booking request accepted successfully');
            } catch (error) {
              console.error('Error accepting booking request:', error);
              Alert.alert(
                'Error',
                'Failed to accept booking request. Please try again.'
              );
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const handleReject = async (id: string) => {
    Alert.alert(
      'Reject Request',
      'Are you sure you want to reject this booking request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingId(id);
              await bookingRequestService.rejectBookingRequest(id);
              loadBookingRequests(); // Refresh the list
              Alert.alert('Success', 'Booking request rejected');
            } catch (error) {
              console.error('Error rejecting booking request:', error);
              Alert.alert(
                'Error',
                'Failed to reject booking request. Please try again.'
              );
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const getConsultationTypeIcon = (type: string) => {
    switch (type) {
      case 'chat':
        return 'chatbubble-ellipses';
      case 'call':
        return 'call';
      case 'video':
        return 'videocam';
      default:
        return 'help-circle';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#f59e0b'; // amber-500
      case 'confirmed':
        return '#10b981'; // emerald-500
      case 'rejected':
        return '#ef4444'; // red-500
      case 'cancelled':
        return '#6b7280'; // gray-500
      case 'completed':
        return '#3b82f6'; // blue-500
      default:
        return '#6b7280'; // gray-500
    }
  };

  const getStatusText = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const renderBookingItem = ({ item }: { item: BookingRequest }) => {
    const isPending = item.status === 'pending';
    const isProcessing = processingId === item._id;
    
    return (
      <View style={styles.bookingItem}>
        <View style={styles.bookingHeader}>
          <View style={styles.userInfo}>
            <View style={styles.iconContainer}>
              <Ionicons 
                name={getConsultationTypeIcon(item.consultationType)} 
                size={24} 
                color="#6366f1" 
              />
            </View>
            <View>
              <Text style={styles.userName}>{item.userId?.name || 'User'}</Text>
              <Text style={styles.userPhone}>{item.userId?.mobileNumber || 'No phone'}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
        </View>
        
        <View style={styles.bookingDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type:</Text>
            <Text style={styles.detailValue}>
              {item.consultationType.charAt(0).toUpperCase() + item.consultationType.slice(1)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount:</Text>
            <Text style={styles.detailValue}>₹{item.amount}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Requested:</Text>
            <Text style={styles.detailValue}>{formatDate(item.createdAt)}</Text>
          </View>
          {item.notes && (
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>Notes:</Text>
              <Text style={styles.notesText}>{item.notes}</Text>
            </View>
          )}
        </View>
        
        {isPending && (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleReject(item._id)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>Reject</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => handleAccept(item._id)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>Accept</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Booking Requests</Text>
        
        {/* Socket connection indicator */}
        <View style={styles.connectionContainer}>
          <View style={[
            styles.connectionIndicator, 
            socketConnected ? styles.connected : styles.disconnected
          ]} />
          <Text style={styles.connectionText}>
            {socketConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </View>
      
      {/* New request indicator */}
      {newRequestIndicator && (
        <Animated.View 
          style={[
            styles.newRequestsIndicator,
            { opacity: fadeAnim }
          ]}
        >
          <Ionicons name="notifications" size={20} color="#fff" />
          <Text style={styles.newRequestsText}>New booking requests!</Text>
        </Animated.View>
      )}
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading booking requests...</Text>
        </View>
      ) : bookingRequests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
          <Text style={styles.emptyText}>No pending booking requests</Text>
          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={handleRefresh}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={bookingRequests}
          keyExtractor={(item) => item._id}
          renderItem={renderBookingItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={handleRefresh} 
              colors={['#6366f1']}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827'
  },
  connectionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 5
  },
  connected: {
    backgroundColor: '#10b981' // Green
  },
  disconnected: {
    backgroundColor: '#ef4444' // Red
  },
  connectionText: {
    fontSize: 12,
    color: '#6b7280'
  },
  newRequestsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    justifyContent: 'center'
  },
  newRequestsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4b5563',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  connectionWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  connectionWarningText: {
    fontSize: 14,
    color: '#92400e',
    marginLeft: 8,
  },
  listContainer: {
    padding: 16,
  },
  bookingItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  userPhone: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  bookingDetails: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    width: 90,
    fontSize: 14,
    color: '#6b7280',
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  notesContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#111827',
  },
  actionButtons: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    backgroundColor: '#fee2e2',
  },
  acceptButton: {
    backgroundColor: '#dcfce7',
  },
  actionButtonText: {
    fontWeight: 'bold',
  },
  refreshButton: {
    padding: 12,
    backgroundColor: '#6366f1',
    borderRadius: 8,
    marginTop: 16,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default BookingRequestsScreen; 