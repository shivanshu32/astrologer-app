import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { loginWithOTP } from '../../services/api';

type Props = NativeStackScreenProps<AuthStackParamList, 'OTP'>;

export default function OTPScreen({ route, navigation }: Props) {
  const { mobileNumber, generatedOtp } = route.params;
  const { login, clearStorage } = useAuth();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Clear any existing tokens on component mount
    const clearExistingAuth = async () => {
      try {
        await clearStorage();
      } catch (error) {
        console.error('Error clearing storage:', error);
      }
    };
    
    clearExistingAuth();
  }, [clearStorage]);

  const handleSubmit = async () => {
    if (!otp || otp.length !== 4) {
      Alert.alert('Error', 'Please enter a valid 4-digit OTP');
      return;
    }

    // For development, verify OTP locally first
    if (otp !== generatedOtp) {
      Alert.alert('Error', 'Invalid OTP. Please try again.');
      return;
    }

    setLoading(true);
    try {
      // Call the backend verify-otp endpoint
      const response = await loginWithOTP(mobileNumber, otp);
      
      console.log('Login API Response:', JSON.stringify(response, null, 2));
      
      if (response && response.success && response.token) {
        // Validate token format
        if (typeof response.token !== 'string' || !response.token.includes('.')) {
          throw new Error('Received invalid token format');
        }
        
        // Login with the received token and user data
        await login(response.token, {
          id: response.user.id || response.user._id,
          name: response.user.name,
          mobileNumber: response.user.mobileNumber,
          role: 'astrologer', // Ensure role is set to astrologer
        });
        
        console.log('Successfully authenticated!');
      } else {
        Alert.alert('Authentication Failed', response?.message || 'Failed to verify OTP');
      }
    } catch (error) {
      console.error('Error authenticating:', error);
      Alert.alert(
        'Authentication Error',
        'Could not verify your OTP. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Enter OTP</Text>
        <Text style={styles.subtitle}>
          We've sent a verification code to {mobileNumber}
        </Text>
        
        {__DEV__ && (
          <TouchableOpacity 
            style={styles.debugButton}
            onPress={() => {
              console.log('Debug OTP:', generatedOtp);
              setOtp(generatedOtp);
            }}
          >
            <Text style={styles.debugButtonText}>Fill OTP (Debug)</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.form}>
        <View>
          <Text style={styles.label}>OTP</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter 4-digit OTP"
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
            maxLength={4}
            editable={!loading}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Verify OTP</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.backButtonText}>Change mobile number</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  header: {
    marginTop: 64,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#4B5563',
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    height: 48,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    fontSize: 16,
  },
  button: {
    height: 48,
    backgroundColor: '#6366F1',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#A5B4FC',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    alignItems: 'center',
    marginTop: 8,
  },
  backButtonText: {
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '500',
  },
  debugButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  debugButtonText: {
    color: '#4B5563',
    fontSize: 12,
  },
}); 