import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import OnlineStatusToggle from '../components/OnlineStatusToggle';

type RootStackParamList = {
  Login: undefined;
  OTP: { mobileNumber: string; generatedOtp: string };
  Main: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ProfileScreen = () => {
  const { user, logout, loading } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          onPress: async () => {
            try {
              await logout();
              console.log('Logout successful');
              // Explicitly navigate to Login screen after logout
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error) {
              console.error('Error during logout:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.profileImageContainer}>
          <View style={styles.profileImagePlaceholder}>
            <Text style={styles.profileInitials}>
              {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
            </Text>
          </View>
        </View>
        <Text style={styles.name}>{user?.name || 'Astrologer'}</Text>
        <Text style={styles.mobileNumber}>{user?.mobileNumber || ''}</Text>
      </View>

      {/* Online Status Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Online Status</Text>
        <View style={styles.onlineStatusContainer}>
          <OnlineStatusToggle variant="button" />
          <Text style={styles.onlineStatusDescription}>
            Toggle your online status to let users know when you're available for consultations
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="person-outline" size={24} color="#4B5563" />
          <Text style={styles.menuItemText}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="cash-outline" size={24} color="#4B5563" />
          <Text style={styles.menuItemText}>Earnings</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="time-outline" size={24} color="#4B5563" />
          <Text style={styles.menuItemText}>Availability</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="notifications-outline" size={24} color="#4B5563" />
          <Text style={styles.menuItemText}>Notification Settings</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="lock-closed-outline" size={24} color="#4B5563" />
          <Text style={styles.menuItemText}>Privacy & Security</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="help-circle-outline" size={24} color="#4B5563" />
          <Text style={styles.menuItemText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity 
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
      
      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  profileImageContainer: {
    marginBottom: 16,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitials: {
    fontSize: 36,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  mobileNumber: {
    fontSize: 16,
    color: '#6B7280',
  },
  onlineStatusContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  onlineStatusDescription: {
    marginTop: 12,
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 16,
    color: '#4B5563',
    flex: 1,
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  versionContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  versionText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});

export default ProfileScreen; 