import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { runDiagnostics, connectSocket } from '../services/socketService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';

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

const SocketDiagnostics = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const { debugToken } = useAuth();

  const checkConnection = async () => {
    setLoading(true);
    try {
      const diagnostics = await runDiagnostics();
      setResults(diagnostics);
    } catch (error) {
      console.error('Error running diagnostics:', error);
    } finally {
      setLoading(false);
    }
  };

  const reconnectSocket = async () => {
    setLoading(true);
    try {
      await connectSocket();
      // Run diagnostics again to get updated status
      await checkConnection();
    } catch (error) {
      console.error('Error reconnecting socket:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const checkToken = async () => {
    setLoading(true);
    try {
      // Get the JWT token from storage
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        setTokenInfo({
          error: true,
          message: 'No token found in storage'
        });
        return;
      }
      
      // Decode the token to check its payload
      const decoded = decodeJwt(token);
      
      if (!decoded) {
        setTokenInfo({
          error: true,
          message: 'Failed to decode token'
        });
        return;
      }
      
      // Check if the token contains userType and if it's set correctly
      const hasUserType = 'userType' in decoded;
      const userType = decoded.userType;
      const isCorrectType = userType === 'astrologer';
      
      // Set token info for display
      setTokenInfo({
        error: !isCorrectType,
        decoded,
        hasUserType,
        userType: userType || 'not set',
        isCorrectType,
        tokenPreview: `${token.substring(0, 10)}...${token.substring(token.length - 10)}`,
        exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'not set',
        iat: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : 'not set'
      });
      
      // Also check if we have a userType in AsyncStorage as a fallback
      const storedUserType = await AsyncStorage.getItem('userType');
      if (storedUserType) {
        setTokenInfo((prev: any) => ({
          ...prev,
          storedUserType
        }));
      }
      
    } catch (error) {
      console.error('Error checking token:', error);
      setTokenInfo({
        error: true,
        message: `Error checking token: ${error}`
      });
    } finally {
      setLoading(false);
    }
  };
  
  const fixUserTypeInStorage = async () => {
    setLoading(true);
    try {
      // Store userType in AsyncStorage as a fallback
      await AsyncStorage.setItem('userType', 'astrologer');
      
      // Check token again to confirm changes
      await checkToken();
      
      alert('Successfully set userType="astrologer" in AsyncStorage');
    } catch (error) {
      console.error('Error fixing user type:', error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Socket Connection Diagnostics</Text>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={styles.button} 
          onPress={checkConnection}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Run Diagnostics</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.reconnectButton]} 
          onPress={reconnectSocket}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Reconnect Socket</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={[styles.button, styles.tokenButton]} 
          onPress={checkToken}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Check Token</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.fixButton]} 
          onPress={fixUserTypeInStorage}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Fix UserType</Text>
        </TouchableOpacity>
      </View>
      
      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}
      
      {tokenInfo && (
        <View style={styles.resultsContainer}>
          <Text style={styles.sectionTitle}>Token Information</Text>
          
          {tokenInfo.error && tokenInfo.message ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{tokenInfo.message}</Text>
            </View>
          ) : (
            <>
              <View style={styles.infoContainer}>
                <Text style={styles.infoLabel}>userType:</Text>
                <Text style={[
                  styles.infoValue,
                  tokenInfo.isCorrectType ? styles.goodValue : styles.badValue
                ]}>
                  {tokenInfo.userType} 
                  {!tokenInfo.isCorrectType && ' (Should be "astrologer")'}
                </Text>
              </View>
              
              {tokenInfo.storedUserType && (
                <View style={styles.infoContainer}>
                  <Text style={styles.infoLabel}>Storage:</Text>
                  <Text style={styles.infoValue}>
                    userType="{tokenInfo.storedUserType}" in AsyncStorage
                  </Text>
                </View>
              )}
              
              <View style={styles.infoContainer}>
                <Text style={styles.infoLabel}>Expires:</Text>
                <Text style={styles.infoValue}>{tokenInfo.exp}</Text>
              </View>
              
              <View style={styles.infoContainer}>
                <Text style={styles.infoLabel}>Created:</Text>
                <Text style={styles.infoValue}>{tokenInfo.iat}</Text>
              </View>
              
              <View style={styles.infoContainer}>
                <Text style={styles.infoLabel}>Token:</Text>
                <Text style={styles.infoValue}>{tokenInfo.tokenPreview}</Text>
              </View>
              
              <TouchableOpacity 
                style={styles.detailsButton}
                onPress={() => setExpanded(!expanded)}
              >
                <Text style={styles.detailsButtonText}>
                  {expanded ? 'Hide Token Details' : 'Show Token Details'}
                </Text>
              </TouchableOpacity>
              
              {expanded && tokenInfo.decoded && (
                <ScrollView style={styles.detailsContainer}>
                  <Text style={styles.detailsText}>
                    {JSON.stringify(tokenInfo.decoded, null, 2)}
                  </Text>
                </ScrollView>
              )}
            </>
          )}
        </View>
      )}
      
      {results && (
        <View style={styles.resultsContainer}>
          <Text style={styles.sectionTitle}>Socket Status</Text>
          
          <View style={[
            styles.statusBadge, 
            results.success ? styles.statusSuccess : styles.statusFailure
          ]}>
            <Text style={styles.statusText}>
              {results.success ? 'CONNECTED' : 'NOT CONNECTED'}
            </Text>
          </View>
          
          <View style={styles.infoContainer}>
            <Text style={styles.infoLabel}>Socket ID:</Text>
            <Text style={styles.infoValue}>
              {results.connectionInfo.socketId || 'Not connected'}
            </Text>
          </View>
          
          <View style={styles.infoContainer}>
            <Text style={styles.infoLabel}>Listeners:</Text>
            <Text style={styles.infoValue}>
              {results.connectionInfo.listenersCount}
            </Text>
          </View>
          
          <View style={styles.infoContainer}>
            <Text style={styles.infoLabel}>Token:</Text>
            <Text style={styles.infoValue}>
              {results.connectionInfo.tokenExists ? 'Available' : 'Missing'}
            </Text>
          </View>
          
          {results.recommendations.length > 0 && (
            <View style={styles.recommendationsContainer}>
              <Text style={styles.recommendationsTitle}>Recommendations:</Text>
              {results.recommendations.map((rec: string, index: number) => (
                <Text key={index} style={styles.recommendation}>• {rec}</Text>
              ))}
            </View>
          )}
          
          <TouchableOpacity 
            style={styles.detailsButton}
            onPress={() => setExpanded(!expanded)}
          >
            <Text style={styles.detailsButtonText}>
              {expanded ? 'Hide Details' : 'Show Details'}
            </Text>
          </TouchableOpacity>
          
          {expanded && (
            <ScrollView style={styles.detailsContainer}>
              <Text style={styles.detailsText}>{results.detailedReport}</Text>
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#4a56e2',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  reconnectButton: {
    backgroundColor: '#2e7d32',
    marginRight: 0,
    marginLeft: 8,
  },
  tokenButton: {
    backgroundColor: '#5c6bc0',
    marginRight: 8,
  },
  fixButton: {
    backgroundColor: '#f57c00',
    marginRight: 0,
    marginLeft: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  loading: {
    alignItems: 'center',
    marginVertical: 20,
  },
  loadingText: {
    marginTop: 8,
    color: '#666',
  },
  resultsContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  statusSuccess: {
    backgroundColor: '#e6f7e6',
    borderColor: '#2e7d32',
    borderWidth: 1,
  },
  statusFailure: {
    backgroundColor: '#ffebee',
    borderColor: '#c62828',
    borderWidth: 1,
  },
  statusText: {
    fontWeight: 'bold',
  },
  infoContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoLabel: {
    fontWeight: 'bold',
    width: 80,
  },
  infoValue: {
    flex: 1,
  },
  goodValue: {
    color: '#2e7d32',
  },
  badValue: {
    color: '#c62828',
  },
  errorContainer: {
    padding: 12,
    backgroundColor: '#ffebee',
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: '#c62828',
  },
  recommendationsContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f57c00',
  },
  recommendationsTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  recommendation: {
    marginBottom: 4,
  },
  detailsButton: {
    marginTop: 16,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  detailsButtonText: {
    color: '#4a56e2',
    fontWeight: 'bold',
  },
  detailsContainer: {
    marginTop: 12,
    maxHeight: 200,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  detailsText: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
});

export default SocketDiagnostics; 