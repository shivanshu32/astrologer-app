import React from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StyleSheet 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainStackParamList, TabNavigatorParamList } from '../navigation/types';
import { CommonActions } from '@react-navigation/native';

type HomeScreenNavigationProp = NativeStackNavigationProp<MainStackParamList> & 
  BottomTabNavigationProp<TabNavigatorParamList>;

const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  const navigateToBookingRequests = () => {
    // Navigate to the BookingRequestsTab in the bottom tab navigator
    navigation.navigate('BookingRequestsTab');
  };

  const navigateToProfile = () => {
    navigation.navigate('ProfileTab');
  };

  const navigateToConsultations = () => {
    // This would navigate to a Consultations screen once it's implemented
    // For now, just stay on the current screen
    console.log('Navigate to Consultations - not yet implemented');
  };

  const navigateToEarnings = () => {
    // This would navigate to an Earnings screen once it's implemented
    // For now, just stay on the current screen
    console.log('Navigate to Earnings - not yet implemented');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome, Astrologer</Text>
        <Text style={styles.subGreeting}>Manage your consultations and earnings</Text>
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
            <Text style={styles.statValue}>0</Text>
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
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  subGreeting: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 5,
  },
  quickActionsContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
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
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  statsContainer: {
    padding: 16,
    marginBottom: 20,
  },
  statsCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6366f1',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default HomeScreen; 