import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useBookingNotification } from '../contexts/BookingNotificationContext';
import NewBookingRequestCard from './NewBookingRequestCard';

const NewBookingRequestsSection: React.FC = () => {
  const { 
    recentBookingRequests, 
    isLoading, 
    acceptBooking, 
    rejectBooking,
    refreshBookingRequests,
    socketConnected
  } = useBookingNotification();
  const navigation = useNavigation<any>();

  // One-time fetch on mount (the socket listeners will handle updates)
  useEffect(() => {
    // Initial fetch only - socket will handle updates
    refreshBookingRequests();
  }, []);

  // Count pending requests
  const pendingCount = recentBookingRequests.length;

  // Navigate to booking requests screen
  const navigateToBookingRequests = () => {
    navigation.navigate('BookingRequestsTab');
  };

  // Only show section if there are pending requests
  if (pendingCount === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Ionicons name="notifications" size={20} color="#6366f1" />
          <Text style={styles.title}>New Booking Requests</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {/* Socket connection indicator */}
          <View style={[
            styles.connectionIndicator, 
            socketConnected ? styles.connected : styles.disconnected
          ]}>
            <Ionicons 
              name={socketConnected ? "wifi" : "wifi-outline"} 
              size={12} 
              color="#fff" 
            />
          </View>
          <TouchableOpacity onPress={navigateToBookingRequests}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={recentBookingRequests.slice(0, 3)} // Limit to 3 most recent
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <NewBookingRequestCard
            bookingRequest={item}
            onAccept={acceptBooking}
            onReject={rejectBooking}
            isLoading={isLoading}
          />
        )}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={isLoading} 
            onRefresh={refreshBookingRequests} 
            colors={['#6366f1']}
            tintColor="#6366f1"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No pending booking requests</Text>
          </View>
        }
      />
      
      {pendingCount > 3 && (
        <TouchableOpacity 
          style={styles.viewMoreButton}
          onPress={navigateToBookingRequests}
        >
          <Text style={styles.viewMoreText}>View {pendingCount - 3} more requests</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  connected: {
    backgroundColor: 'rgba(16, 185, 129, 0.7)',
  },
  disconnected: {
    backgroundColor: 'rgba(239, 68, 68, 0.7)',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginLeft: 8,
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  viewAll: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  viewMoreButton: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  viewMoreText: {
    color: '#6366f1',
    fontWeight: '500',
  },
});

export default NewBookingRequestsSection; 