import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { loginWithOTP } from '../../services/api';

// Updated navigation type to match the actual app structure
type RootStackParamList = {
  Login: undefined;
  OTP: { mobileNumber: string; generatedOtp: string };
  Main: undefined;
  VoiceCallSession: undefined;
  VideoCallSession: undefined;
  BookingRequestsTab: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'OTP'>;

// Function to decode JWT token
const decodeJwt = (token: string): any => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

export default function OTPScreen({ route, navigation }: Props) {
  const { mobileNumber, generatedOtp } = route.params;
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    clearExistingAuth();
  }, []);

  // Clear any existing auth data to avoid conflicts
  const clearExistingAuth = async () => {
    try {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('astrologerProfile');
      console.log('Cleared existing auth data');
    } catch (error) {
      console.error('Error clearing auth data:', error);
    }
  };

  const handleSubmit = async () => {
    if (!otp) {
      Alert.alert('Error', 'Please enter OTP');
      return;
    }

    setLoading(true);

    try {
      // Send OTP verification request
      const response = await loginWithOTP(mobileNumber, otp);
      
      console.log('Login API Response:', JSON.stringify(response, null, 2));
      
      if (response && response.success && response.token) {
        console.log('Received valid API response with token');
        
        // Validate token format
        if (typeof response.token !== 'string' || !response.token.includes('.')) {
          console.error('Invalid token format:', response.token);
          throw new Error('Received invalid token format');
        }
        
        // Check if token has the correct userType
        const decodedToken = decodeJwt(response.token);
        console.log('Decoded token payload:', decodedToken);
        
        // Get astrologer ID from various sources
        const astrologerId = decodedToken?.id || decodedToken?._id || response.user?.id || response.user?._id;
        
        // Ensure we have a valid astrologer ID
        if (!astrologerId) {
          console.warn('⚠️ Warning: Could not extract astrologer ID from token or response');
          
          // For now, continue with login but this might cause issues later
          Alert.alert(
            'Warning',
            'Could not determine your unique ID which may affect some features. Please contact support if you experience issues.'
          );
        } else {
          console.log(`✓ Found astrologer ID: ${astrologerId}`);
        }
        
        // Verify token has correct userType for astrologer app
        if (!decodedToken.userType || decodedToken.userType !== 'astrologer') {
          console.warn('⚠️ Warning: JWT token does not have userType "astrologer"');
          console.log('This may cause socket connection issues - will set correct user data');
        }
        
        console.log('Calling login with token and user data...');
        
        // Store in AsyncStorage first to make it available to socket service
        await AsyncStorage.setItem('userType', 'astrologer');
        await AsyncStorage.setItem('authToken', response.token); // Alternative token key
        
        // Store user data for socket service
        interface UserData {
          id: string;
          name: string;
          mobileNumber: string;
          email?: string;
          role: string;
          userType: string;
          type: string;
          astrologerId?: string;
        }
        
        const userData: UserData = {
          id: response.user.id || response.user._id,
          name: response.user.name,
          mobileNumber: response.user.mobileNumber,
          email: response.user.email,
          role: 'astrologer',
          userType: 'astrologer', // Add userType property explicitly
          type: 'astrologer', // Add legacy type property
          // Always set astrologerId if available
          ...(astrologerId && { astrologerId })
        };
        
        // Store for socket service to use
        await AsyncStorage.setItem('userData', JSON.stringify(userData));
        
        // Also store astrologerId directly for easier access
        if (astrologerId) {
          await AsyncStorage.setItem('astrologerId', astrologerId);
        }
        
        // Now fetch the astrologer profile to get more details
        console.log('Fetching astrologer profile...');
        try {
          // Set up api with the token
          api.defaults.headers.common['Authorization'] = `Bearer ${response.token}`;
          
          // The correct endpoint for fetching current user's profile. Needs to be separate from the /:id endpoint
          const profileResult = await api.get('/astrologers/profile');
          
          console.log('Astrologer profile response:', JSON.stringify(profileResult.data, null, 2));
          
          if (profileResult.data && profileResult.data.data) {
            // Get the astrologer data from the correct path
            const astrologerData = profileResult.data.data;
            
            // Make sure we have a valid ID
            if (astrologerData && astrologerData._id) {
              // Store the full astrologer profile for future use
              await AsyncStorage.setItem('astrologerProfile', JSON.stringify(astrologerData));
              console.log('Stored astrologer profile with ID:', astrologerData._id);
              
              // Add the astrologer ID to the user data
              userData.astrologerId = astrologerData._id;
              await AsyncStorage.setItem('userData', JSON.stringify(userData));
              
              // Also store just the ID separately for easier access
              await AsyncStorage.setItem('astrologerId', astrologerData._id);
            } else {
              console.warn('Astrologer profile found but missing _id field:', astrologerData);
            }
          } else {
            console.warn('Could not fetch astrologer profile - unexpected response format');
          }
        } catch (profileError) {
          console.error('Error fetching astrologer profile:', profileError);
          console.log('Will try another approach to get astrologer ID...');
          
          // Try to get the astrologer ID directly from user ID since they should match
          try {
            console.log('Using user ID as astrologer ID fallback');
            const astrologerId = response.user.id || response.user._id;
            
            if (astrologerId) {
              console.log('Using user ID as astrologer ID:', astrologerId);
              userData.astrologerId = astrologerId;
              await AsyncStorage.setItem('userData', JSON.stringify(userData));
              await AsyncStorage.setItem('astrologerId', astrologerId);
            } else {
              console.warn('Could not get a valid astrologer ID, not saving to AsyncStorage');
            }
          } catch (idError) {
            console.error('Error setting astrologer ID fallback:', idError);
          }
        }
        
        // Login with the received token and user data
        await login(response.token, userData);
        
        console.log('Successfully authenticated!');
        
        // Navigate to Main screen after successful authentication
        console.log('Attempting to navigate to Main screen...');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
        console.log('Navigation command executed');
      } else {
        console.warn('Authentication failed:', response?.message || 'Unknown reason');
        
        // Check if this is the specific error for astrologer not found
        if (response?.message?.includes('Astrologer with this mobile number not found')) {
          Alert.alert(
            'Astrologer Not Found', 
            'No astrologer profile exists with this mobile number. Please contact support if you believe this is an error.'
          );
        } else {
          Alert.alert('Authentication Failed', response?.message || 'Failed to verify OTP');
        }
      }
    } catch (error: any) {
      console.error('Error authenticating:', error);
      
      // Check for specific error responses
      if (error.response && error.response.data) {
        const errorData = error.response.data;
        
        if (errorData.message?.includes('Astrologer with this mobile number not found')) {
          Alert.alert(
            'Astrologer Not Found', 
            'No astrologer profile exists with this mobile number. Please contact support if you believe this is an error.'
          );
        } else {
          Alert.alert(
            'Authentication Error',
            errorData.message || 'Could not verify your OTP. Please try again.'
          );
        }
      } else {
        Alert.alert(
          'Authentication Error',
          'Could not verify your OTP. Please try again.'
        );
      }
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