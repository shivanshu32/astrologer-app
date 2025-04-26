import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StyleSheet,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainStackParamList, TabNavigatorParamList } from '../navigation/types';
import { CommonActions } from '@react-navigation/native';
import { useBookingNotification } from '../contexts/BookingNotificationContext';
import NewBookingRequestsSection from '../components/NewBookingRequestsSection';
import SocketDiagnostics from '../components/SocketDiagnostics';
import OnlineStatusToggle from '../components/OnlineStatusToggle';

type HomeScreenNavigationProp = NativeStackNavigationProp<MainStackParamList> & 
  BottomTabNavigationProp<TabNavigatorParamList>;

const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { refreshBookingRequests, isLoading, recentBookingRequests, socketConnected } = useBookingNotification();
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    // Initial fetch only when first mounted
    // The socket will handle real-time updates
    refreshBookingRequests();
    
    // No additional fetching on focus - let socket handle updates
  }, []);

  const navigateToBookingRequests = () => {
    // Navigate to the BookingRequestsTab in the bottom tab navigator
    navigation.navigate('BookingRequestsTab');
  };

  const navigateToProfile = () => {
    navigation.navigate('ProfileTab');
  };

  const navigateToConsultations = () => {
    // Navigate to the Consultations screen that is already implemented
    navigation.navigate('Consultations');
  };

  const navigateToEarnings = () => {
    // This would navigate to an Earnings screen once it's implemented
    // For now, just stay on the current screen
    console.log('Navigate to Earnings - not yet implemented');
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl 
          refreshing={isLoading} 
          onRefresh={refreshBookingRequests} 
          colors={['#6366f1']}
          tintColor="#ffffff"
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.greeting}>Welcome, Astrologer</Text>
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
        </View>
        <Text style={styles.subGreeting}>Manage your consultations and earnings</Text>
      </View>

      {/* Online Status Toggle Section */}
      <View style={styles.onlineStatusSection}>
        <OnlineStatusToggle variant="button" />
      </View>

      {/* New Booking Requests Section */}
      <View style={styles.bookingRequestsContainer}>
        <NewBookingRequestsSection />
      </View>

      <View style={styles.quickActionsContainer}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={navigateToBookingRequests}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#e0f2fe' }]}>
              <Ionicons name="calendar" size={24} color="#0284c7" />
            </View>
            <Text style={styles.actionTitle}>Booking Requests</Text>
            <Text style={styles.actionDescription}>View and manage your booking requests</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={navigateToConsultations}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="videocam" size={24} color="#16a34a" />
            </View>
            <Text style={styles.actionTitle}>Consultations</Text>
            <Text style={styles.actionDescription}>View your scheduled consultations</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={navigateToEarnings}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="cash" size={24} color="#d97706" />
            </View>
            <Text style={styles.actionTitle}>Earnings</Text>
            <Text style={styles.actionDescription}>Track your earnings and payments</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={navigateToProfile}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#f3e8ff' }]}>
              <Ionicons name="person" size={24} color="#7e22ce" />
            </View>
            <Text style={styles.actionTitle}>Profile</Text>
            <Text style={styles.actionDescription}>Update your profile information</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <Text style={styles.sectionTitle}>Your Stats</Text>
        <View style={styles.statsCards}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{recentBookingRequests.length}</Text>
            <Text style={styles.statLabel}>Pending Requests</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Today's Consultations</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>₹0</Text>
            <Text style={styles.statLabel}>This Month's Earnings</Text>
          </View>
        </View>
      </View>
      
      {/* Socket Diagnostics Section */}
      <View style={styles.diagnosticsSection}>
        <TouchableOpacity 
          style={styles.diagnosticsButton}
          onPress={() => setShowDiagnostics(!showDiagnostics)}
        >
          <Text style={styles.diagnosticsButtonText}>
            {showDiagnostics ? 'Hide Diagnostics' : 'Show Socket Diagnostics'}
          </Text>
        </TouchableOpacity>
        
        {showDiagnostics && <SocketDiagnostics />}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 20,
    backgroundColor: '#6366f1',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  greeting: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subGreeting: {
    fontSize: 14,
    color: '#e0e7ff',
    marginTop: 5,
  },
  onlineStatusSection: {
    alignItems: 'center',
    paddingVertical: 16,
    marginVertical: 8,
    backgroundColor: 'white',
    borderRadius: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bookingRequestsContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  quickActionsContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  statsContainer: {
    marginTop: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statsCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '31%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  diagnosticsSection: {
    marginTop: 16,
    paddingHorizontal: 16,
    marginBottom: 32,
    alignItems: 'center',
  },
  diagnosticsButton: {
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  diagnosticsButtonText: {
    color: '#6b7280',
    fontSize: 14,
  },
});

export default HomeScreen; 