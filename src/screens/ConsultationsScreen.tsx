import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { styled } from 'nativewind';
import { getConsultations, Booking } from '../services/bookingService';

type ConsultationType = 'chat' | 'call' | 'video';
type ConsultationStatus = 'upcoming' | 'completed' | 'cancelled';

interface Consultation {
  id: string;
  userName: string;
  date: string;
  time: string;
  type: ConsultationType;
  status: ConsultationStatus;
  duration: number;
}

// User type for proper typing
interface UserDetails {
  name: string;
  _id: string;
}

const getConsultationTypeIcon = (type: ConsultationType): any => {
  switch (type) {
    case 'chat':
      return 'chatbubbles';
    case 'call':
      return 'call';
    case 'video':
      return 'videocam';
    default:
      return 'help-circle';
  }
};

const getStatusColor = (status: ConsultationStatus): string => {
  switch (status) {
    case 'completed':
      return 'text-gray-500';
    case 'upcoming':
      return 'text-green-500';
    case 'cancelled':
      return 'text-red-500';
    default:
      return 'text-gray-700';
  }
};

// Convert API booking to consultation format
const mapBookingToConsultation = (booking: Booking): Consultation => {
  // Format date and time
  const bookingDate = booking.startTime ? new Date(booking.startTime) : new Date();
  const formattedDate = bookingDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const formattedTime = `${bookingDate.getHours().toString().padStart(2, '0')}:${bookingDate.getMinutes().toString().padStart(2, '0')}`;
  
  // Map status
  let status: ConsultationStatus = 'upcoming';
  if (booking.status === 'completed') {
    status = 'completed';
  } else if (booking.status === 'cancelled') {
    status = 'cancelled';
  } else if (booking.status === 'active' || booking.status === 'confirmed' || booking.status === 'pending') {
    status = 'upcoming';
  }
  
  // Handle user data type
  let userName = 'User';
  if (typeof booking.user === 'object' && booking.user !== null) {
    if ('name' in booking.user && booking.user.name) {
      userName = booking.user.name;
    } else if ('_id' in booking.user) {
      userName = `User ${booking.user._id.substring(0, 4)}`;
    }
  } else if (typeof booking.user === 'string') {
    userName = `User ${booking.user.substring(0, 4)}`;
  }
  
  return {
    id: booking._id,
    userName: userName,
    date: formattedDate,
    time: formattedTime,
    type: booking.consultationType as ConsultationType,
    status: status,
    duration: booking.duration || 30
  };
};

const ConsultationsScreen = () => {
  const navigation = useNavigation<any>();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed'>('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0); // Track refresh attempts

  const fetchConsultations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Starting to fetch consultations...');
      
      // Use the specialized getConsultations function instead of getMyBookings
      const bookings = await getConsultations();
      
      console.log(`Received ${bookings.length} consultations from API`);
      
      // If we got data, reset the refresh counter
      if (bookings.length > 0) {
        setRefreshCount(0);
      }
      
      // Don't use mock data if the API returned an empty array
      if (bookings.length === 0) {
        console.log('API returned empty consultations array');
        setConsultations([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      // Map the bookings to the consultations format
      const mappedConsultations = bookings.map(booking => {
        console.log(`Processing consultation: ${booking._id}`);
        return mapBookingToConsultation(booking);
      });
      
      console.log(`Mapped ${mappedConsultations.length} consultations`);
      setConsultations(mappedConsultations);
    } catch (err: any) {
      console.error('Error fetching consultations:', err);
      
      // Increment refresh counter
      setRefreshCount(prev => prev + 1);
      
      // Log more detailed error information
      if (err.response) {
        console.error('Error response status:', err.response.status);
        console.error('Error response data:', JSON.stringify(err.response.data));
      }
      
      if (err.request) {
        console.error('Error request:', JSON.stringify(err.request));
      }
      
      // If we've tried 3 times or more and still have errors, show a more specific message
      if (refreshCount >= 2) {
        setError('Network error connecting to server. Try again later or check your connection.');
      } else {
        setError('Failed to load consultations. Please try again later.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchConsultations();
  }, []);

  // Handle refresh
  const handleRefresh = () => {
    setRefreshing(true);
    fetchConsultations();
  };

  const filteredConsultations = consultations.filter((item) => 
    activeTab === 'upcoming' ? item.status === 'upcoming' : item.status === 'completed'
  );

  const renderConsultationItem = ({ item }: { item: Consultation }) => (
    <TouchableOpacity 
      style={{ 
        backgroundColor: 'white', 
        padding: 16, 
        borderRadius: 8, 
        marginBottom: 12, 
        borderWidth: 1, 
        borderColor: '#f3f4f6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
        elevation: 1
      }}
      onPress={() => {
        // Handle consultation press based on type and status
        if (item.status === 'upcoming') {
          if (item.type === 'video') {
            navigation.navigate('VideoCallSession', { bookingId: item.id });
          } else if (item.type === 'call') {
            navigation.navigate('VoiceCallSession', { bookingId: item.id });
          } else if (item.type === 'chat') {
            // Navigate to chat screen if available
            Alert.alert('Chat', 'Chat consultation will be available soon');
          }
        }
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#e0e7ff', padding: 8, borderRadius: 20 }}>
            <Ionicons name={getConsultationTypeIcon(item.type) as any} size={20} color="#6366f1" />
          </View>
          <Text style={{ marginLeft: 8, fontWeight: 'bold', color: '#1f2937' }}>{item.userName}</Text>
        </View>
        <Text style={{ 
          fontWeight: '600', 
          color: item.status === 'completed' ? '#6b7280' : 
                 item.status === 'upcoming' ? '#10b981' : '#ef4444' 
        }}>
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </Text>
      </View>
      
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: '#4b5563' }}>
          {item.date} at {item.time}
        </Text>
        <Text style={{ color: '#4b5563' }}>
          {item.duration} min {item.type}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb', padding: 16 }}>
      <View style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        marginBottom: 16, 
        backgroundColor: '#e5e7eb', 
        borderRadius: 8, 
        padding: 4 
      }}>
        <TouchableOpacity 
          style={{ 
            flex: 1, 
            paddingVertical: 8, 
            borderRadius: 8,
            backgroundColor: activeTab === 'upcoming' ? 'white' : 'transparent'
          }}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={{ 
            textAlign: 'center', 
            fontWeight: '500',
            color: activeTab === 'upcoming' ? '#6366f1' : '#4b5563'
          }}>
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{ 
            flex: 1, 
            paddingVertical: 8, 
            borderRadius: 8,
            backgroundColor: activeTab === 'completed' ? 'white' : 'transparent'
          }}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={{ 
            textAlign: 'center', 
            fontWeight: '500',
            color: activeTab === 'completed' ? '#6366f1' : '#4b5563'
          }}>
            Completed
          </Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={{ padding: 16, backgroundColor: '#fee2e2', borderRadius: 8, marginBottom: 16 }}>
          <Text style={{ color: '#ef4444' }}>{error}</Text>
          <TouchableOpacity 
            onPress={fetchConsultations}
            style={{ marginTop: 8, alignSelf: 'flex-end' }}
          >
            <Text style={{ color: '#6366f1', fontWeight: '500' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : filteredConsultations.length > 0 ? (
        <FlatList
          data={filteredConsultations}
          renderItem={renderConsultationItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons 
            name={(activeTab === 'upcoming' ? 'calendar-outline' : 'checkmark-done-outline') as any} 
            size={64} 
            color="#d1d5db" 
          />
          <Text style={{ marginTop: 16, color: '#9ca3af', fontSize: 18 }}>
            No {activeTab} consultations
          </Text>
        </View>
      )}
    </View>
  );
};

export default ConsultationsScreen; 