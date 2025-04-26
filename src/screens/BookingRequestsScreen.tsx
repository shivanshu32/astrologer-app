import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as bookingRequestService from '../services/bookingRequestService';
import { formatDate } from '../utils/dateUtils';
import { useBookingNotification } from '../contexts/BookingNotificationContext';

// Define types
type BookingRequestsScreenProps = NativeStackNavigationProp<any>;
type RequestStatusFilter = 'pending' | 'accepted' | 'declined' | 'all';

interface User {
  _id: string;
  name: string;
  mobileNumber?: string;
  profileImage?: string;
}

interface BookingRequest {
  _id: string;
  userId: User | string;
  astrologerId: string;
  consultationType: 'chat' | 'call' | 'video';
  status: 'pending' | 'accepted' | 'declined';
  amount: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const BookingRequestsScreen = () => {
  const navigation = useNavigation<BookingRequestsScreenProps>();
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<BookingRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState<RequestStatusFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Use notification context for socket status
  const { socketConnected, lastUpdated } = useBookingNotification();

  // Apply filter to booking requests
  const applyFilter = useCallback((requests: BookingRequest[], filter: RequestStatusFilter) => {
    if (filter === 'all') {
      return requests;
    }
    return requests.filter(req => req.status === filter);
  }, []);

  // Apply filter whenever it changes or requests change
  useEffect(() => {
    setFilteredRequests(applyFilter(bookingRequests, activeFilter));
  }, [activeFilter, bookingRequests, applyFilter]);

  // Function to fetch booking requests
  const fetchBookingRequests = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Fetching booking requests...');
      
      // Try different approaches to fetch booking requests
      let requests: BookingRequest[] = [];
      
      try {
        // 1. First try to get the astrologer ID from storage
        const astrologerId = await AsyncStorage.getItem('astrologerId');
        
        if (astrologerId) {
          console.log(`Using astrologer ID: ${astrologerId}`);
          
          // Use the endpoint that fetches by astrologer ID
          const response = await bookingRequestService.getBookingRequestsByAstrologerId(astrologerId);
          
          if (response && response.length > 0) {
            requests = response;
            console.log(`Fetched ${requests.length} booking requests by astrologer ID`);
          }
        }
      } catch (error) {
        console.error('Error fetching by astrologer ID:', error);
      }
      
      // 2. If first attempt failed, try the astrologer endpoint
      if (requests.length === 0) {
        try {
          console.log('Trying astrologer endpoint...');
          const response = await bookingRequestService.getMyBookingRequests();
          
          if (response && response.length > 0) {
            requests = response;
            console.log(`Fetched ${requests.length} booking requests from astrologer endpoint`);
          }
        } catch (error) {
          console.error('Error fetching from astrologer endpoint:', error);
        }
      }
      
      // 3. If that also failed, try with filtered status
      if (requests.length === 0 && activeFilter !== 'all') {
        try {
          console.log(`Trying filtered endpoint with status: ${activeFilter}`);
          const response = await bookingRequestService.getFilteredBookingRequests(activeFilter);
          
          if (response && response.length > 0) {
            requests = response;
            console.log(`Fetched ${requests.length} booking requests with status filter`);
          }
        } catch (error) {
          console.error('Error fetching with status filter:', error);
        }
      }
      
      // Store and process the requests
      setBookingRequests(requests);
      console.log(`Total booking requests: ${requests.length}`);
      
      return requests;
    } catch (error) {
      console.error('Error fetching booking requests:', error);
      Alert.alert('Error', 'Failed to load booking requests. Please try again.');
      return [];
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  // Handle refresh
  const handleRefresh = () => {
    setRefreshing(true);
    fetchBookingRequests();
  };

  // When the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchBookingRequests();
    }, [fetchBookingRequests])
  );

  // Watch for lastUpdated changes from context
  useEffect(() => {
    if (lastUpdated) {
      console.log(`New updates detected, refreshing booking requests...`);
      fetchBookingRequests();
    }
  }, [lastUpdated, fetchBookingRequests]);

  // Handle accept booking
  const handleAccept = async (id: string) => {
    try {
      setProcessingId(id);
      
      // Confirm before accepting
      Alert.alert(
        'Accept Booking',
        'Are you sure you want to accept this booking request?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Accept',
            onPress: async () => {
              try {
                const updatedBooking = await bookingRequestService.acceptBookingRequest(id);
                
                // Update the local state with the updated booking
                setBookingRequests(prevRequests => 
                  prevRequests.map(req => 
                    req._id === id ? { ...req, status: 'accepted' } : req
                  )
                );
                
                Alert.alert('Success', 'Booking request accepted successfully.');
              } catch (error) {
                console.error('Error accepting booking:', error);
                Alert.alert('Error', 'Failed to accept booking. Please try again.');
              } finally {
                setProcessingId(null);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error accepting booking:', error);
      Alert.alert('Error', 'Failed to accept booking. Please try again.');
      setProcessingId(null);
    }
  };

  // Handle reject booking
  const handleReject = async (id: string) => {
    try {
      setProcessingId(id);
      
      // Confirm before rejecting
      Alert.alert(
        'Reject Booking',
        'Are you sure you want to reject this booking request?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: async () => {
              try {
                const updatedBooking = await bookingRequestService.declineBookingRequest(id);
                
                // Update the local state with the updated booking
                setBookingRequests(prevRequests => 
                  prevRequests.map(req => 
                    req._id === id ? { ...req, status: 'declined' } : req
                  )
                );
                
                Alert.alert('Success', 'Booking request rejected successfully.');
              } catch (error) {
                console.error('Error rejecting booking:', error);
                Alert.alert('Error', 'Failed to reject booking. Please try again.');
              } finally {
                setProcessingId(null);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error rejecting booking:', error);
      Alert.alert('Error', 'Failed to reject booking. Please try again.');
      setProcessingId(null);
    }
  };

  // Helper function to get consultation type icon
  const getConsultationTypeIcon = (type: string) => {
    switch (type) {
      case 'chat':
        return <Ionicons name="chatbubble-outline" size={20} color="#4CAF50" />;
      case 'call':
        return <Ionicons name="call-outline" size={20} color="#2196F3" />;
      case 'video':
        return <Ionicons name="videocam-outline" size={20} color="#9C27B0" />;
      default:
        return <Ionicons name="help-circle-outline" size={20} color="#757575" />;
    }
  };

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#FFC107'; // Yellow
      case 'accepted':
        return '#4CAF50'; // Green
      case 'declined':
        return '#F44336'; // Red
      default:
        return '#757575'; // Grey
    }
  };

  // Helper function to get status text
  const getStatusText = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // Render booking item
  const renderBookingItem = ({ item }: { item: BookingRequest }) => {
    // Extract user info - handle both object and string cases
    const userId = typeof item.userId === 'string' ? item.userId : item.userId._id;
    const userName = typeof item.userId === 'string' ? 'User' : item.userId.name;
    const userMobile = typeof item.userId === 'string' ? '' : item.userId.mobileNumber || '';
    const userImage = typeof item.userId === 'string' ? null : item.userId.profileImage;
    
    return (
      <View style={styles.bookingCard}>
        <View style={styles.bookingHeader}>
          <View style={styles.userInfo}>
            {userImage ? (
              <Image source={{ uri: userImage }} style={styles.userImage} />
            ) : (
              <View style={styles.userImagePlaceholder}>
                <Text style={styles.userInitial}>{userName.charAt(0)}</Text>
              </View>
            )}
            <View>
              <Text style={styles.userName}>{userName}</Text>
              {userMobile && <Text style={styles.userMobile}>{userMobile}</Text>}
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
        </View>
        
        <View style={styles.bookingInfo}>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Type</Text>
              <View style={styles.consultationType}>
                {getConsultationTypeIcon(item.consultationType)}
                <Text style={styles.consultationTypeText}>
                  {item.consultationType.charAt(0).toUpperCase() + item.consultationType.slice(1)}
                </Text>
              </View>
            </View>
            
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Amount</Text>
              <Text style={styles.infoValue}>₹{item.amount}</Text>
            </View>
            
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>{formatDate(item.createdAt)}</Text>
            </View>
          </View>
          
          {item.notes && (
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>Notes:</Text>
              <Text style={styles.notesText}>{item.notes}</Text>
            </View>
          )}
        </View>
        
        {item.status === 'pending' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleReject(item._id)}
              disabled={processingId === item._id}
            >
              {processingId === item._id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="close-outline" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => handleAccept(item._id)}
              disabled={processingId === item._id}
            >
              {processingId === item._id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-outline" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // Render filter tabs
  const renderFilterTabs = () => {
    const tabs = [
      { value: 'pending', label: 'Pending' },
      { value: 'accepted', label: 'Accepted' },
      { value: 'declined', label: 'Declined' },
      { value: 'all', label: 'All' }
    ] as const;
    
    return (
      <View style={styles.filterContainer}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.value}
            style={[
              styles.filterTab,
              activeFilter === tab.value && styles.activeFilterTab
            ]}
            onPress={() => setActiveFilter(tab.value)}
          >
            <Text
              style={[
                styles.filterTabText,
                activeFilter === tab.value && styles.activeFilterTabText
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // Render socket status indicator
  const renderSocketStatus = () => (
    <View style={styles.socketStatusContainer}>
      <View style={[
        styles.socketIndicator,
        { backgroundColor: socketConnected ? '#4CAF50' : '#F44336' }
      ]} />
      <Text style={styles.socketStatusText}>
        {socketConnected ? 'Connected' : 'Disconnected'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Booking Requests</Text>
        {renderSocketStatus()}
      </View>
      
      {renderFilterTabs()}
      
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6200ee" />
          <Text style={styles.loadingText}>Loading booking requests...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          renderItem={renderBookingItem}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#6200ee']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color="#CCCCCC" />
              <Text style={styles.emptyText}>No booking requests found</Text>
              <Text style={styles.emptySubtext}>
                {activeFilter !== 'all' 
                  ? `You don't have any ${activeFilter} booking requests.` 
                  : 'You don\'t have any booking requests yet.'}
              </Text>
              <TouchableOpacity 
                style={styles.refreshButton}
                onPress={handleRefresh}
              >
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#6200ee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  socketStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socketIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  socketStatusText: {
    fontSize: 12,
    color: '#fff',
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 20,
    marginHorizontal: 4,
  },
  activeFilterTab: {
    backgroundColor: '#e8e4ff',
  },
  filterTabText: {
    fontSize: 14,
    color: '#666',
  },
  activeFilterTabText: {
    color: '#6200ee',
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 12,
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  userImagePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  userInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  userMobile: {
    fontSize: 12,
    color: '#666',
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
  bookingInfo: {
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  consultationType: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  consultationTypeText: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '500',
  },
  notesContainer: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  notesText: {
    fontSize: 14,
    color: '#333',
  },
  actionButtons: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  refreshButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#6200ee',
    borderRadius: 20,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default BookingRequestsScreen; 