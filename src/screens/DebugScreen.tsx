import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Button } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectSocket, isSocketConnected, testBookingNotification, runDiagnostics } from '../services/socketService';
import SocketDiagnostics from '../components/SocketDiagnostics';
import { styled } from 'nativewind';

// Styled components
const StyledView = styled(View);
const StyledText = styled(Text);
const StyledScrollView = styled(ScrollView);

const TokenDisplayComponent = () => {
  const [tokenValue, setTokenValue] = useState('');

  const getToken = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        setTokenValue(token);
        console.log('Token found:', token);
      } else {
        setTokenValue('No token found');
        console.log('No token found');
      }
    } catch (error) {
      console.error('Error getting token:', error);
      setTokenValue('Error retrieving token');
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>JWT Token</Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.button}
          onPress={getToken}
        >
          <Text style={styles.buttonText}>Show JWT Token</Text>
        </TouchableOpacity>
      </View>
      
      {tokenValue ? (
        <View style={styles.dataContainer}>
          <Text style={styles.subtitle}>Token:</Text>
          <Text style={styles.dataValue} selectable>{tokenValue}</Text>
        </View>
      ) : null}
    </View>
  );
};

const DebugScreen = () => {
  const [asyncStorageData, setAsyncStorageData] = useState<any>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [astrologerInfo, setAstrologerInfo] = useState<any>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    // Initial check of socket connection
    setConnected(isSocketConnected());
    
    // Set up periodic check of connection status
    const interval = setInterval(() => {
      setConnected(isSocketConnected());
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const checkAsyncStorage = async () => {
    try {
      setLoading(true);
      const keys = await AsyncStorage.getAllKeys();
      const result: Record<string, any> = {};
      
      for (const key of keys) {
        try {
          const value = await AsyncStorage.getItem(key);
          
          // Try to parse JSON values
          if (value && (value.startsWith('{') || value.startsWith('['))) {
            try {
              result[key] = JSON.parse(value);
            } catch {
              result[key] = value;
            }
          } else {
            result[key] = value;
          }
        } catch {
          result[key] = 'Error reading value';
        }
      }
      
      setAsyncStorageData(result);
    } catch (error) {
      console.error('Error fetching AsyncStorage data:', error);
      Alert.alert('Error', 'Could not fetch AsyncStorage data');
    } finally {
      setLoading(false);
    }
  };

  const checkAstrologerProfile = async () => {
    try {
      setLoading(true);
      
      // Get astrologer profile and user data
      const astrologerProfileString = await AsyncStorage.getItem('astrologerProfile');
      const userDataString = await AsyncStorage.getItem('userData');
      
      let profileInfo = {
        astrologerProfile: null as any,
        userData: null as any,
        socketIdentifier: null as string | null
      };
      
      if (astrologerProfileString) {
        try {
          profileInfo.astrologerProfile = JSON.parse(astrologerProfileString);
          console.log('Found astrologer profile:', profileInfo.astrologerProfile);
        } catch (error) {
          console.error('Error parsing astrologer profile:', error);
        }
      } else {
        console.log('No astrologer profile found in storage');
      }
      
      if (userDataString) {
        try {
          profileInfo.userData = JSON.parse(userDataString);
          console.log('Found user data:', profileInfo.userData);
        } catch (error) {
          console.error('Error parsing user data:', error);
        }
      } else {
        console.log('No user data found in storage');
      }
      
      // Determine which ID would be used for socket connection
      if (profileInfo.astrologerProfile && profileInfo.astrologerProfile._id) {
        profileInfo.socketIdentifier = profileInfo.astrologerProfile._id;
      } else if (profileInfo.userData && profileInfo.userData.astrologerId) {
        profileInfo.socketIdentifier = profileInfo.userData.astrologerId;
      }
      
      setAstrologerInfo(profileInfo);
      
      // Display the results
      Alert.alert(
        'Astrologer Profile Info',
        `Astrologer ID: ${profileInfo.socketIdentifier || 'Not found'}\n\n` +
        `This is the ID used for socket connections. It should match the ID in the backend logs.`
      );
    } catch (error) {
      console.error('Error checking astrologer profile:', error);
      Alert.alert('Error', 'Failed to check astrologer profile');
    } finally {
      setLoading(false);
    }
  };
  
  const fixAstrologerId = async () => {
    try {
      setLoading(true);
      
      // Target ID for Astro Uttam
      const targetId = '67ffe412a96474bf13f80a14';
      
      // Update all storage items that contain astrologer ID
      await AsyncStorage.setItem('astrologerId', targetId);
      
      // Update userData if exists
      const userDataString = await AsyncStorage.getItem('userData');
      if (userDataString) {
        try {
          const userData = JSON.parse(userDataString);
          userData.astrologerId = targetId;
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
        } catch (error) {
          console.error('Error updating userData:', error);
        }
      }
      
      // Update astrologerProfile if exists
      const profileString = await AsyncStorage.getItem('astrologerProfile');
      if (profileString) {
        try {
          const profile = JSON.parse(profileString);
          profile._id = targetId;
          await AsyncStorage.setItem('astrologerProfile', JSON.stringify(profile));
        } catch (error) {
          console.error('Error updating astrologerProfile:', error);
        }
      }
      
      // Create minimal astrologer profile if none exists
      if (!profileString) {
        const minimalProfile = {
          _id: targetId,
          displayName: 'Astro Uttam',
          mobile: '9999999999',
          status: 'active'
        };
        await AsyncStorage.setItem('astrologerProfile', JSON.stringify(minimalProfile));
      }
      
      // Force disconnect and reconnect socket to apply changes
      await checkAstrologerProfile();
      
      Alert.alert(
        'Astrologer ID Updated',
        `ID set to: ${targetId}\n\nPress "Test Connection" to reconnect socket with new ID.`,
        [
          { 
            text: 'Reconnect Now',
            onPress: testSocketConnection
          },
          {
            text: 'OK',
            style: 'cancel'
          }
        ]
      );
    } catch (error) {
      console.error('Error fixing astrologer ID:', error);
      Alert.alert('Error', 'Failed to update astrologer ID');
    } finally {
      setLoading(false);
    }
  };

  const clearAsyncStorage = async () => {
    try {
      await AsyncStorage.clear();
      Alert.alert('Success', 'AsyncStorage cleared');
      setAsyncStorageData(null);
      setAstrologerInfo(null);
    } catch (error) {
      console.error('Error clearing AsyncStorage:', error);
      Alert.alert('Error', 'Could not clear AsyncStorage');
    }
  };

  const testSocketConnection = async () => {
    try {
      setLoading(true);
      const socket = await connectSocket();
      setConnected(!!socket?.connected);
      Alert.alert(
        'Socket Connection',
        socket ? `Connected! Socket ID: ${socket.id}` : 'Failed to connect'
      );
    } catch (error) {
      console.error('Socket connection test error:', error);
      Alert.alert('Error', 'Socket connection test failed');
    } finally {
      setLoading(false);
    }
  };

  const runSocketDiagnostics = async () => {
    try {
      setLoading(true);
      const result = await runDiagnostics();
      setDiagnosticResult(result);
      Alert.alert(
        'Diagnostics Complete',
        `Connection status: ${result.success ? 'Success' : 'Failed'}`
      );
    } catch (error) {
      console.error('Diagnostics error:', error);
      Alert.alert('Error', 'Failed to run diagnostics');
    } finally {
      setLoading(false);
    }
  };

  const testNotification = () => {
    try {
      const result = testBookingNotification();
      Alert.alert(
        'Test Notification',
        result 
          ? 'Test notification sent to listeners' 
          : 'Failed - socket not connected'
      );
    } catch (error) {
      console.error('Test notification error:', error);
      Alert.alert('Error', 'Failed to send test notification');
    }
  };

  const triggerManualSocketTest = async () => {
    try {
      setLoading(true);
      
      // Ensure socket is connected
      const socket = await connectSocket();
      if (!socket || !socket.connected) {
        Alert.alert('Error', 'Socket is not connected. Please connect first.');
        return;
      }
      
      // Register a one-time listener for our test event
      socket.once('test-notification', (data) => {
        Alert.alert('Notification Received', JSON.stringify(data, null, 2));
      });
      
      // Emit event to request a test notification
      socket.emit('request-test-notification', { 
        timestamp: new Date().toISOString(),
        clientInfo: {
          device: 'Astrologer App',
          testing: true
        }
      });
      
      Alert.alert('Test Request Sent', 'Waiting for notification from server...');
    } catch (error) {
      console.error('Manual test error:', error);
      Alert.alert('Error', 'Failed to perform manual test');
    } finally {
      setLoading(false);
    }
  };

  const displayToken = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('token');
      if (storedToken) {
        setToken(storedToken);
        console.log('JWT Token:', storedToken);
      } else {
        setToken('No token found');
        console.log('No token found in AsyncStorage');
      }
    } catch (error) {
      console.error('Error getting token:', error);
      setToken('Error getting token');
    }
  };

  return (
    <StyledView className="flex-1 bg-white p-4">
      <StyledText className="text-lg font-bold mb-4">Debug Tools</StyledText>
      
      <TokenDisplayComponent />
      
      <StyledView className="section">
        <StyledText className="sectionTitle">Socket Connection</StyledText>
        <StyledView className="buttonRow">
          <TouchableOpacity
            className={[loading && 'buttonDisabled']}
            onPress={testSocketConnection}
            disabled={loading}
          >
            <StyledText className="buttonText">Test Connection</StyledText>
          </TouchableOpacity>
          
          <TouchableOpacity
            className={[loading && 'buttonDisabled']}
            onPress={runSocketDiagnostics}
            disabled={loading}
          >
            <StyledText className="buttonText">Run Diagnostics</StyledText>
          </TouchableOpacity>
        </StyledView>
        
        <StyledView className="statusContainer">
          <StyledText className="statusLabel">Socket Connected:</StyledText>
          <StyledText className={[
            'statusValue',
            connected ? 'successText' : 'errorText'
          ]}>
            {connected ? 'Yes' : 'No'}
          </StyledText>
        </StyledView>
      </StyledView>
      
      <StyledView className="section">
        <StyledText className="sectionTitle">Astrologer Profile</StyledText>
        <StyledView className="buttonRow">
          <TouchableOpacity
            className={[loading && 'buttonDisabled']}
            onPress={checkAstrologerProfile}
            disabled={loading}
          >
            <StyledText className="buttonText">Check ID</StyledText>
          </TouchableOpacity>
          
          <TouchableOpacity
            className={[styles.warningButton, loading && 'buttonDisabled']}
            onPress={fixAstrologerId}
            disabled={loading}
          >
            <StyledText className="buttonText">Fix Astro Uttam ID</StyledText>
          </TouchableOpacity>
        </StyledView>
        
        {astrologerInfo && (
          <StyledView className="dataContainer">
            <StyledText className="subtitle">Socket Identifier:</StyledText>
            <StyledText className={[
              'statusValue',
              astrologerInfo.socketIdentifier ? 'successText' : 'errorText'
            ]}>
              {astrologerInfo.socketIdentifier || 'Not Found'}
            </StyledText>
          </StyledView>
        )}
      </StyledView>
      
      <StyledView className="section">
        <StyledText className="sectionTitle">Notification Testing</StyledText>
        <StyledView className="buttonRow">
          <TouchableOpacity
            className={[loading && 'buttonDisabled']}
            onPress={testNotification}
            disabled={loading}
          >
            <StyledText className="buttonText">Test Local Notification</StyledText>
          </TouchableOpacity>
          
          <TouchableOpacity
            className={[loading && 'buttonDisabled']}
            onPress={triggerManualSocketTest}
            disabled={loading}
          >
            <StyledText className="buttonText">Request Server Test</StyledText>
          </TouchableOpacity>
        </StyledView>
      </StyledView>

      <StyledView className="section">
        <StyledText className="sectionTitle">AsyncStorage</StyledText>
        <StyledView className="buttonRow">
          <TouchableOpacity
            className={[loading && 'buttonDisabled']}
            onPress={checkAsyncStorage}
            disabled={loading}
          >
            <StyledText className="buttonText">View Storage</StyledText>
          </TouchableOpacity>
          
          <TouchableOpacity
            className={[styles.dangerButton, loading && 'buttonDisabled']}
            onPress={() => {
              Alert.alert(
                'Confirm',
                'Are you sure you want to clear all data?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', onPress: clearAsyncStorage, style: 'destructive' }
                ]
              );
            }}
            disabled={loading}
          >
            <StyledText className="buttonText">Clear Storage</StyledText>
          </TouchableOpacity>
        </StyledView>
        
        {asyncStorageData && (
          <StyledView className="dataContainer">
            <StyledText className="subtitle">Storage Contents:</StyledText>
            {Object.entries(asyncStorageData).map(([key, value]) => (
              <StyledView key={key} className="dataItem">
                <StyledText className="dataKey">{key}:</StyledText>
                <StyledText className="dataValue">
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </StyledText>
              </StyledView>
            ))}
          </StyledView>
        )}
      </StyledView>
      
      {diagnosticResult && (
        <StyledView className="section">
          <StyledText className="sectionTitle">Diagnostic Results</StyledText>
          <StyledView className="dataContainer">
            <StyledText className="subtitle">
              Connection Status: 
              <StyledText className={[diagnosticResult.success ? 'successText' : 'errorText']}>
                {' '}{diagnosticResult.success ? 'SUCCESS' : 'FAILED'}
              </StyledText>
            </StyledText>
            
            {diagnosticResult.recommendations && diagnosticResult.recommendations.length > 0 && (
              <>
                <StyledText className="subtitle">Recommendations:</StyledText>
                {diagnosticResult.recommendations.map((rec: string, i: number) => (
                  <StyledText key={i} className="recommendationText">• {rec}</StyledText>
                ))}
              </>
            )}
            
            <StyledText className="subtitle">Connection Info:</StyledText>
            <StyledText className="dataValue">
              {JSON.stringify(diagnosticResult.connectionInfo, null, 2)}
            </StyledText>
          </StyledView>
        </StyledView>
      )}
      
      <StyledView className="section">
        <StyledText className="sectionTitle">Advanced Diagnostics</StyledText>
        <SocketDiagnostics />
      </StyledView>
      
      {loading && (
        <StyledView className="loadingOverlay">
          <ActivityIndicator size="large" color="#6366F1" />
        </StyledView>
      )}
    </StyledView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#6366F1',
    padding: 10,
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '500',
  },
  buttonDisabled: {
    backgroundColor: '#a5a6f6',
  },
  dangerButton: {
    backgroundColor: '#ef4444',
  },
  warningButton: {
    backgroundColor: '#f59e0b',
  },
  dataContainer: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  dataItem: {
    marginBottom: 8,
  },
  dataKey: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
  dataValue: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusLabel: {
    fontWeight: 'bold',
    marginRight: 8,
  },
  statusValue: {
    fontWeight: '600',
  },
  successText: {
    color: '#22c55e',
  },
  errorText: {
    color: '#ef4444',
  },
  recommendationText: {
    marginBottom: 4,
    fontSize: 14,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});

export default DebugScreen; 