import React, { useEffect } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  Dimensions,
  Image,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBookingNotification } from '../contexts/BookingNotificationContext';
import { BookingRequest } from '../services/bookingRequestService';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatService } from '../services/chatService';

const { width } = Dimensions.get('window');

const BookingRequestPopup: React.FC = () => {
  const { 
    activeBookingRequest, 
    isLoading, 
    acceptBooking, 
    rejectBooking,
    socketConnected,
    dismissNotification
  } = useBookingNotification();
  
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Log when the popup receives booking data for debugging
  useEffect(() => {
    if (activeBookingRequest) {
      console.log('BookingRequestPopup received active request:', activeBookingRequest._id);
      console.log('Booking details:', JSON.stringify(activeBookingRequest, null, 2));
    }
  }, [activeBookingRequest]);

  // Return null if there's no active booking request
  if (!activeBookingRequest) {
    console.log('BookingRequestPopup: No active booking request to display');
    return null;
  }

  // Helper functions
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

  const getConsultationTypeName = (type: string) => {
    switch (type) {
      case 'chat':
        return 'Chat Consultation';
      case 'call':
        return 'Voice Call Consultation';
      case 'video':
        return 'Video Call Consultation';
      default:
        return 'Consultation';
    }
  };

  // Format timestamp to readable time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  // Handle direct dismiss button
  const handleDismiss = () => {
    console.log('Manually dismissing booking notification');
    dismissNotification();
  };
  
  // Handle accept booking and navigate to appropriate screen
  const handleAcceptBooking = async () => {
    if (isLoading) return;
    
    try {
      const bookingData = await acceptBooking(activeBookingRequest._id);
      console.log('Booking accepted:', bookingData);
      
      // Extract user ID safely
      const userId = typeof activeBookingRequest.userId === 'object' ? 
        activeBookingRequest.userId._id : activeBookingRequest.userId;
      
      // Store booking data for use in consultation screens
      try {
        await AsyncStorage.setItem('currentBookingData', JSON.stringify({
          bookingId: activeBookingRequest._id,
          userId: userId,
          consultationType: activeBookingRequest.consultationType
        }));
      } catch (error) {
        console.error('Error storing booking data:', error);
      }
      
      let chatId = bookingData?.chatId || null;
      
      // For chat consultations, try to create a chat automatically
      if (activeBookingRequest.consultationType === 'chat') {
        try {
          console.log('Creating chat for booking:', activeBookingRequest._id);
          
          // Try to create or get existing chat
          const chatResult = await chatService.createChatForBooking(
            activeBookingRequest._id, 
            userId as string
          );
          
          console.log('Chat creation result:', JSON.stringify(chatResult));
          
          if (chatResult) {
            if (chatResult._id) {
              console.log('Chat created successfully with ID:', chatResult._id);
              chatId = chatResult._id;
            } else if (chatResult.chatId) {
              console.log('Chat created successfully with chatId:', chatResult.chatId);
              chatId = chatResult.chatId;
            } else if (chatResult.chat && chatResult.chat._id) {
              console.log('Chat created successfully with chat._id:', chatResult.chat._id);
              chatId = chatResult.chat._id;
            }
          }
          
          if (!chatId) {
            console.log('No chat ID found in response, using booking ID as fallback');
            chatId = activeBookingRequest._id;
          }
        } catch (chatError) {
          console.error('Failed to create chat:', chatError);
          // We'll still navigate to chat screen, where they can retry
          chatId = activeBookingRequest._id; // Use booking ID as fallback
        }
      }
      
      // Navigate to appropriate screen based on consultation type
      setTimeout(() => {
        dismissNotification();
        
        // Navigate based on consultation type
        switch (activeBookingRequest.consultationType) {
          case 'chat':
            // Always pass both chatId and bookingId to ensure chat creation works
            navigation.navigate('Chat', { 
              chatId: chatId, 
              bookingId: activeBookingRequest._id 
            });
            break;
            
          case 'call':
            // For voice call - use the 'Call' route from RootStackParamList
            navigation.navigate('Call', { 
              bookingId: activeBookingRequest._id 
            });
            break;
            
          case 'video':
            // For video call - use the 'VideoCall' route from RootStackParamList
            navigation.navigate('VideoCall', { 
              bookingId: activeBookingRequest._id 
            });
            break;
            
          default:
            console.error('Unknown consultation type:', activeBookingRequest.consultationType);
            break;
        }
      }, 500);
    } catch (error) {
      console.error('Error accepting booking:', error);
    }
  };

  // Get user info safely
  const getUserName = () => {
    if (typeof activeBookingRequest.userId === 'object' && activeBookingRequest.userId !== null) {
      return activeBookingRequest.userId.name || 'User';
    }
    return 'User';
  };
  
  const getUserMobileNumber = () => {
    if (typeof activeBookingRequest.userId === 'object' && activeBookingRequest.userId !== null) {
      // @ts-ignore - mobileNumber might not be in the type definition but could exist in the data
      return activeBookingRequest.userId.mobileNumber || '';
    }
    return '';
  };
  
  const getUserNotes = () => {
    // @ts-ignore - notes property might not be in the type definition but could exist in the data
    return activeBookingRequest.notes || '';
  };
  
  const hasNotes = () => {
    // @ts-ignore - notes property might not be in the type definition but could exist in the data
    return !!activeBookingRequest.notes;
  };

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={!!activeBookingRequest}
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header with dismiss button */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons 
                name={getConsultationTypeIcon(activeBookingRequest.consultationType)} 
                size={28} 
                color="#fff" 
              />
            </View>
            <View style={styles.headerContent}>
              <Text style={styles.title}>New Booking Request</Text>
              <Text style={styles.subtitle}>
                {getConsultationTypeName(activeBookingRequest.consultationType)}
              </Text>
            </View>
            
            {/* Socket connection indicator */}
            <View style={[
              styles.connectionIndicator, 
              socketConnected ? styles.connected : styles.disconnected
            ]}>
              <Ionicons 
                name={socketConnected ? "wifi" : "wifi-outline"} 
                size={16} 
                color="#fff" 
              />
            </View>
            
            {/* Add dismiss button */}
            <TouchableOpacity 
              style={styles.dismissButton}
              onPress={handleDismiss}
            >
              <Ionicons name="close-circle" size={24} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>

          {/* User Details */}
          <View style={styles.userSection}>
            <View style={styles.avatarContainer}>
              <Image 
                source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }} 
                style={styles.avatar}
              />
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{getUserName()}</Text>
              <Text style={styles.userPhone}>
                <Ionicons name="call-outline" size={14} color="#666" /> {getUserMobileNumber()}
              </Text>
              <Text style={styles.timestamp}>
                <Ionicons name="time-outline" size={14} color="#666" /> Requested at {formatTime(activeBookingRequest.createdAt)}
              </Text>
            </View>
          </View>

          {/* Amount */}
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Consultation Amount</Text>
            <Text style={styles.amount}>₹{activeBookingRequest.amount}</Text>
          </View>

          {/* Notes */}
          {hasNotes() && (
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>User's Notes:</Text>
              <Text style={styles.notes}>{getUserNotes()}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {isLoading ? (
              <ActivityIndicator size="large" color="#6366f1" />
            ) : (
              <>
                <TouchableOpacity 
                  style={[styles.button, styles.rejectButton]}
                  onPress={() => rejectBooking(activeBookingRequest._id)}
                  disabled={isLoading}
                >
                  <Ionicons name="close" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.button, styles.acceptButton]}
                  onPress={handleAcceptBooking}
                  disabled={isLoading}
                >
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Accept</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Add this at the end of the actions section */}
          <Text style={styles.footerText}>
            Booking ID: {activeBookingRequest._id.substring(0, 8)}...
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: width - 40,
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    backgroundColor: '#6366f1',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
  connectionIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connected: {
    backgroundColor: 'rgba(16, 185, 129, 0.6)', // Green with opacity
  },
  disconnected: {
    backgroundColor: 'rgba(239, 68, 68, 0.6)', // Red with opacity
  },
  userSection: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e5e7eb',
  },
  userDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 14,
    color: '#6b7280',
  },
  amountContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 16,
    color: '#374151',
  },
  amount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10b981',
  },
  notesContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 4,
  },
  notes: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    justifyContent: 'space-between',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
  },
  dismissButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 8,
    marginBottom: 8,
  }
});

export default BookingRequestPopup; 