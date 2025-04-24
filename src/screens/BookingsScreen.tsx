import React, { useState, useEffect } from 'react';
import { View as RNView, Text as RNText, TouchableOpacity as RNTouchableOpacity, FlatList, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { styled } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const View = styled(RNView);
const Text = styled(RNText);
const TouchableOpacity = styled(RNTouchableOpacity);

// Mock data for bookings
const mockBookings = [
  {
    id: 'booking1',
    userId: 'user1',
    userName: 'Rahul Sharma',
    type: 'chat',
    status: 'pending',
    scheduledAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    amount: 299,
  },
  {
    id: 'booking2',
    userId: 'user2',
    userName: 'Priya Patel',
    type: 'audio',
    status: 'confirmed',
    scheduledAt: new Date(Date.now() + 1800000).toISOString(), // 30 minutes from now
    amount: 499,
  },
  {
    id: 'booking3',
    userId: 'user3',
    userName: 'Amit Kumar',
    type: 'video',
    status: 'confirmed',
    scheduledAt: new Date(Date.now() + 900000).toISOString(), // 15 minutes from now
    amount: 799,
  },
  {
    id: 'booking4',
    userId: 'user4',
    userName: 'Neha Gupta',
    type: 'video',
    status: 'completed',
    scheduledAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    amount: 799,
  },
];

type BookingType = 'chat' | 'audio' | 'video';
type BookingStatus = 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled';

interface Booking {
  id: string;
  userId: string;
  userName: string;
  type: BookingType;
  status: BookingStatus;
  scheduledAt: string;
  amount: number;
}

const BookingsScreen = () => {
  const navigation = useNavigation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed'>('upcoming');

  useEffect(() => {
    // In a real app, we would fetch from API
    // For now, use mock data
    setBookings(mockBookings);
    setLoading(false);
  }, []);

  const acceptBooking = (booking: Booking) => {
    // Update booking status
    const updatedBookings = bookings.map(b => 
      b.id === booking.id ? { ...b, status: 'confirmed' as BookingStatus } : b
    );
    setBookings(updatedBookings);
    
    Alert.alert(
      'Booking Accepted',
      `You have accepted the ${booking.type} consultation with ${booking.userName}.`,
      [{ text: 'OK' }]
    );
  };

  const rejectBooking = (booking: Booking) => {
    Alert.alert(
      'Reject Booking',
      `Are you sure you want to reject this booking with ${booking.userName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reject', 
          style: 'destructive',
          onPress: () => {
            // Update booking status
            const updatedBookings = bookings.map(b => 
              b.id === booking.id ? { ...b, status: 'cancelled' as BookingStatus } : b
            );
            setBookings(updatedBookings);
            
            Alert.alert('Booking Rejected', 'The booking has been rejected.');
          }
        }
      ]
    );
  };

  const startConsultation = (booking: Booking) => {
    // Start consultation based on type
    switch (booking.type) {
      case 'chat':
        // Navigate to chat screen
        Alert.alert('Chat Consultation', 'Starting chat consultation.');
        break;
      case 'audio':
        // Navigate to call screen
        navigation.navigate('VoiceCallSession', { 
          bookingId: booking.id,
          userData: {
            name: booking.userName,
            id: booking.userId
          }
        });
        break;
      case 'video':
        // Navigate to video call screen
        navigation.navigate('VideoCallSession', { 
          bookingId: booking.id,
          userData: {
            name: booking.userName,
            id: booking.userId
          }
        });
        break;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short', 
      year: 'numeric'
    });
  };

  const isUpcoming = (booking: Booking) => {
    return ['pending', 'confirmed'].includes(booking.status);
  };

  const filteredBookings = bookings.filter(booking => 
    activeTab === 'upcoming' ? isUpcoming(booking) : !isUpcoming(booking)
  );

  const getIcon = (type: BookingType) => {
    switch (type) {
      case 'chat':
        return 'chatbubbles';
      case 'audio':
        return 'call';
      case 'video':
        return 'videocam';
      default:
        return 'help-circle';
    }
  };

  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500';
      case 'confirmed':
        return 'bg-green-500';
      case 'in-progress':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-gray-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 pt-12">
      <View className="px-4 py-2">
        <Text className="text-2xl font-bold text-gray-800">Bookings</Text>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-gray-200 bg-white">
        <TouchableOpacity 
          className={`flex-1 py-3 items-center ${activeTab === 'upcoming' ? 'border-b-2 border-orange-500' : ''}`}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text className={`font-medium ${activeTab === 'upcoming' ? 'text-orange-500' : 'text-gray-600'}`}>
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          className={`flex-1 py-3 items-center ${activeTab === 'completed' ? 'border-b-2 border-orange-500' : ''}`}
          onPress={() => setActiveTab('completed')}
        >
          <Text className={`font-medium ${activeTab === 'completed' ? 'text-orange-500' : 'text-gray-600'}`}>
            Past
          </Text>
        </TouchableOpacity>
      </View>

      {/* Booking List */}
      <FlatList
        data={filteredBookings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View className="bg-white rounded-lg overflow-hidden shadow-sm mb-4 border border-gray-100">
            <View className="p-4">
              <View className="flex-row justify-between items-center mb-2">
                <View className="flex-row items-center">
                  <View className={`w-8 h-8 rounded-full ${getStatusColor(item.status)} items-center justify-center mr-2`}>
                    <Ionicons name={getIcon(item.type)} size={16} color="white" />
                  </View>
                  <Text className="font-semibold text-lg">{item.userName}</Text>
                </View>
                <Text className="text-gray-600 font-medium">₹{item.amount}</Text>
              </View>
              
              <View className="flex-row items-center mb-2">
                <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-1">
                  {formatDate(item.scheduledAt)} at {formatTime(item.scheduledAt)}
                </Text>
              </View>
              
              <View className="flex-row justify-between items-center mb-2">
                <View className="flex-row items-center">
                  <Text className="text-gray-600 text-sm mr-2">Type:</Text>
                  <View className="bg-gray-100 rounded-full px-3 py-1">
                    <Text className="text-gray-700 text-xs capitalize">{item.type} Consultation</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-gray-600 text-sm mr-2">Status:</Text>
                  <View className={`rounded-full px-3 py-1 ${
                    item.status === 'pending' ? 'bg-yellow-100' :
                    item.status === 'confirmed' ? 'bg-green-100' :
                    item.status === 'in-progress' ? 'bg-blue-100' : 
                    item.status === 'completed' ? 'bg-gray-100' : 'bg-red-100'
                  }`}>
                    <Text className={`text-xs capitalize ${
                      item.status === 'pending' ? 'text-yellow-800' :
                      item.status === 'confirmed' ? 'text-green-800' :
                      item.status === 'in-progress' ? 'text-blue-800' : 
                      item.status === 'completed' ? 'text-gray-800' : 'text-red-800'
                    }`}>
                      {item.status}
                    </Text>
                  </View>
                </View>
              </View>
              
              {activeTab === 'upcoming' && (
                <View className="flex-row justify-end mt-2">
                  {item.status === 'pending' && (
                    <>
                      <TouchableOpacity 
                        className="bg-gray-100 rounded-lg px-4 py-2 mr-2"
                        onPress={() => rejectBooking(item)}
                      >
                        <Text className="text-gray-700">Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        className="bg-orange-500 rounded-lg px-4 py-2"
                        onPress={() => acceptBooking(item)}
                      >
                        <Text className="text-white">Accept</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  
                  {item.status === 'confirmed' && (
                    <TouchableOpacity 
                      className="bg-green-500 rounded-lg px-4 py-2"
                      onPress={() => startConsultation(item)}
                    >
                      <Text className="text-white">Start {item.type === 'chat' ? 'Chat' : item.type === 'audio' ? 'Call' : 'Video Call'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-8">
            <Ionicons name="calendar-outline" size={48} color="#D1D5DB" />
            <Text className="text-gray-400 mt-4 text-center">No {activeTab} bookings found</Text>
          </View>
        }
      />
    </View>
  );
};

export default BookingsScreen; 