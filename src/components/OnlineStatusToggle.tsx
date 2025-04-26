import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

interface OnlineStatusToggleProps {
  // Optional initial status - if not provided, will be fetched from backend
  initialStatus?: boolean;
  // Optional callback for when status changes
  onStatusChange?: (isOnline: boolean) => void;
  // Display variant - 'switch' for simple toggle or 'button' for a more prominent button
  variant?: 'switch' | 'button';
}

const OnlineStatusToggle: React.FC<OnlineStatusToggleProps> = ({ 
  initialStatus, 
  onStatusChange,
  variant = 'switch'
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(initialStatus ?? false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If no initial status is provided, get current status from backend
    if (initialStatus === undefined) {
      fetchCurrentStatus();
    }
  }, []);

  const fetchCurrentStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get auth token from storage
      const token = await AsyncStorage.getItem('authToken');
      
      if (!token) {
        setError('Authentication required');
        return;
      }
      
      // Get current astrologer profile (to check isOnline status)
      const response = await axios.get(`${API_URL}/astrologers/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data && response.data.success) {
        setIsOnline(response.data.data.isOnline);
      } else {
        setError('Could not fetch current status');
      }
    } catch (err) {
      console.error('Error fetching astrologer status:', err);
      setError('Failed to get current status');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleOnlineStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get auth token from storage
      const token = await AsyncStorage.getItem('authToken');
      
      if (!token) {
        setError('Authentication required');
        return;
      }
      
      // Call the API to toggle status
      const response = await axios.post(
        `${API_URL}/astrologers/toggle-online-status`,
        {},  // Empty body, since toggle is handled on the server
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (response.data && response.data.success) {
        // Update local state
        setIsOnline(response.data.isOnline);
        
        // Call callback if provided
        if (onStatusChange) {
          onStatusChange(response.data.isOnline);
        }
        
        // Show brief toast/alert
        console.log(response.data.message);
      } else {
        setError('Failed to update status');
      }
    } catch (err) {
      console.error('Error toggling online status:', err);
      setError('Failed to update status');
      Alert.alert('Error', 'Could not update your online status. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Render as simple switch
  if (variant === 'switch') {
    return (
      <View style={styles.switchContainer}>
        <Text style={[styles.statusText, isOnline ? styles.onlineText : styles.offlineText]}>
          {isOnline ? 'Online' : 'Offline'}
        </Text>
        
        {isLoading ? (
          <ActivityIndicator size="small" color="#6366f1" />
        ) : (
          <Switch
            trackColor={{ false: '#D1D5DB', true: '#C7D2FE' }}
            thumbColor={isOnline ? '#6366f1' : '#9CA3AF'}
            ios_backgroundColor="#D1D5DB"
            onValueChange={toggleOnlineStatus}
            value={isOnline}
            disabled={isLoading}
          />
        )}
      </View>
    );
  }
  
  // Render as button
  return (
    <TouchableOpacity
      style={[
        styles.buttonContainer,
        isOnline ? styles.onlineButton : styles.offlineButton,
        isLoading && styles.disabledButton
      ]}
      onPress={toggleOnlineStatus}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <>
          <View style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
          <Text style={styles.buttonText}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
          <Ionicons
            name={isOnline ? 'radio' : 'radio-outline'}
            size={16}
            color="#FFFFFF"
            style={styles.icon}
          />
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 8,
  },
  statusText: {
    marginRight: 8,
    fontWeight: '500',
  },
  onlineText: {
    color: '#16A34A',
  },
  offlineText: {
    color: '#6B7280',
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    minWidth: 100,
  },
  onlineButton: {
    backgroundColor: '#16A34A',
  },
  offlineButton: {
    backgroundColor: '#6B7280',
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  onlineDot: {
    backgroundColor: '#FFFFFF',
  },
  offlineDot: {
    backgroundColor: '#FFFFFF',
  },
  icon: {
    marginLeft: 6,
  },
});

export default OnlineStatusToggle; 