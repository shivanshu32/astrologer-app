import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { API_URL, API_PORT, LOCAL_IP, APP_IDENTIFIER } from '../../config';
import { Platform } from 'react-native';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [mobileNumber, setMobileNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const { clearStorage } = useAuth();

  // NOTE TO DEVELOPER: 
  // There was an issue with the API route ordering in the backend. 
  // The '/astrologers/profile' route needs to be defined BEFORE the '/astrologers/:id' route,
  // otherwise Express treats 'profile' as an ID parameter, causing ObjectId casting errors.

  // Function to check if mobile number exists in astrologers collection
  const checkMobileExists = async (mobile: string) => {
    try {
      // Try different URLs based on platform
      const urlsToTry = [
        `${API_URL}/debug/lookup-astrologer/${mobile}`,
        `http://10.0.2.2:${API_PORT.split('/').pop()}/api/debug/lookup-astrologer/${mobile}`, // Android emulator
        `http://${LOCAL_IP}:${API_PORT.split('/').pop()}/api/debug/lookup-astrologer/${mobile}`, // Local network
        `http://localhost:${API_PORT.split('/').pop()}/api/debug/lookup-astrologer/${mobile}` // Standard localhost
      ];
      
      let error = null;
      
      // Try each URL
      for (const url of urlsToTry) {
        try {
          console.log(`Checking if astrologer exists with mobile ${mobile} at ${url}`);
          const response = await axios.get(url, {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
              'X-App-Identifier': APP_IDENTIFIER,
              'User-Agent': 'astrologer-app-mobile',
              'X-App-Platform': Platform.OS
            }
          });
          
          if (response.data && response.data.success) {
            console.log('Astrologer found:', response.data);
            return true;
          } else if (response.data && !response.data.success && 
                    response.data.message && 
                    response.data.message.includes('No astrologer')) {
            console.log('No astrologer found with this mobile number');
            return false;
          }
        } catch (urlError: any) {
          error = urlError;
          console.log(`Error with ${url}:`, urlError.message || 'Unknown error');
        }
      }
      
      // If we reach here, all URLs failed
      throw error || new Error('Failed to verify mobile number');
    } catch (error) {
      console.error('Error checking mobile number:', error);
      return null; // Return null to indicate an error (different from false which indicates not found)
    }
  };

  const handleSubmit = async () => {
    if (!mobileNumber || mobileNumber.length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);

    try {
      // Check if the mobile number exists as an astrologer before proceeding
      const exists = await checkMobileExists(mobileNumber);
      
      if (exists === false) {
        Alert.alert(
          'Astrologer Not Found', 
          'No astrologer profile exists with this mobile number. Please contact support if you believe this is an error.'
        );
        return;
      } else if (exists === null) {
        // If the check failed due to network issues, still allow to proceed but warn
        console.log('Mobile check failed, proceeding anyway');
      }
      
      // In development mode, generate a local OTP instead of calling the API
      // The backend does not have the /auth/request-otp endpoint
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      
      // If this were production, we would call the API to send an OTP to the user's phone
      console.log('Generated development OTP:', otp);
      
      // Alert the user with the OTP (for development only)
      if (__DEV__) {
        Alert.alert('Development OTP', `Your OTP is: ${otp}\n\nIn production, this would be sent via SMS.`);
      }
      
      // Navigate to OTP screen with the generated OTP
      navigation.navigate('OTP', {
        mobileNumber,
        generatedOtp: otp
      });
    } catch (error) {
      console.error('Error in OTP generation:', error);
      Alert.alert('Error', 'Failed to generate OTP. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Login</Text>
        <Text style={styles.subtitle}>
          Enter your mobile number to receive an OTP
        </Text>
      </View>

      <View style={styles.form}>
        <View>
          <Text style={styles.label}>Mobile Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter 10-digit mobile number"
            keyboardType="number-pad"
            value={mobileNumber}
            onChangeText={setMobileNumber}
            maxLength={10}
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
            <Text style={styles.buttonText}>Request OTP</Text>
          )}
        </TouchableOpacity>

        {__DEV__ && (
          <TouchableOpacity
            style={styles.debugButton}
            onPress={async () => {
              await clearStorage();
              Alert.alert('Debug', 'Storage cleared');
            }}
          >
            <Text style={styles.debugButtonText}>Clear Storage (Debug)</Text>
          </TouchableOpacity>
        )}
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
  debugButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    alignSelf: 'center',
  },
  debugButtonText: {
    color: '#4B5563',
    fontSize: 12,
  },
}); 