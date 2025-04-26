import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BookingRequest } from '../services/bookingRequestService';

interface NewBookingRequestCardProps {
  bookingRequest: BookingRequest;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isLoading: boolean;
}

const NewBookingRequestCard: React.FC<NewBookingRequestCardProps> = ({
  bookingRequest,
  onAccept,
  onReject,
  isLoading
}) => {
  // Format timestamp to readable time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  // Helper to get icon based on consultation type
  const getConsultationTypeIcon = (type: string) => {
    switch (type) {
      case 'chat':
        return 'chatbubble';
      case 'call':
        return 'call';
      case 'video':
        return 'videocam';
      default:
        return 'help-circle';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Image 
            source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }} 
            style={styles.avatar}
          />
          <View>
            <Text style={styles.userName}>{bookingRequest.userId.name}</Text>
            <Text style={styles.userPhone}>
              <Ionicons name="call-outline" size={12} color="#6b7280" /> {bookingRequest.userId.mobileNumber}
            </Text>
          </View>
        </View>
        <View style={styles.typeContainer}>
          <Ionicons 
            name={getConsultationTypeIcon(bookingRequest.consultationType)} 
            size={16} 
            color="#6366f1" 
          />
          <Text style={styles.timestamp}>{formatTime(bookingRequest.createdAt)}</Text>
        </View>
      </View>
      
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Amount:</Text>
        <Text style={styles.amount}>₹{bookingRequest.amount}</Text>
      </View>
      
      {bookingRequest.notes && (
        <View style={styles.notesContainer}>
          <Text style={styles.notesLabel}>Notes:</Text>
          <Text style={styles.notes} numberOfLines={2}>{bookingRequest.notes}</Text>
        </View>
      )}
      
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.button, styles.rejectButton]}
          onPress={() => onReject(bookingRequest._id)}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.button, styles.acceptButton]}
          onPress={() => onAccept(bookingRequest._id)}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#6366f1',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#e5e7eb',
  },
  userName: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#111827',
  },
  userPhone: {
    fontSize: 12,
    color: '#6b7280',
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#4b5563',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10b981',
  },
  notesContainer: {
    marginBottom: 12,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4b5563',
    marginBottom: 2,
  },
  notes: {
    fontSize: 12,
    color: '#6b7280',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginLeft: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
  },
});

export default NewBookingRequestCard; 