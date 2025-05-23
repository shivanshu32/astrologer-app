import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import * as enhancedSocketService from '../services/enhancedSocketService';
import { useAuth } from '../contexts/AuthContext';

interface ChatConnectionManagerProps {
  chatId?: string;
  bookingId?: string;
  onConnectionStatusChange?: (status: string, isConnected: boolean) => void;
  onJoinSuccess?: (data: any) => void;
  onJoinError?: (error: string) => void;
  autoConnect?: boolean;
  children?: React.ReactNode;
  showStatus?: boolean;
}

/**
 * ChatConnectionManager handles socket connection and chat room joining
 * It provides connection status feedback and manages reconnection attempts
 */
const ChatConnectionManager: React.FC<ChatConnectionManagerProps> = ({
  chatId,
  bookingId,
  onConnectionStatusChange,
  onJoinSuccess,
  onJoinError,
  autoConnect = true,
  children,
  showStatus = true
}) => {
  const { user } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<string>('Initializing...');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [joinAttempts, setJoinAttempts] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  
  // Update connection status and notify parent component
  const updateConnectionStatus = useCallback((status: string, connected: boolean) => {
    setConnectionStatus(status);
    setIsConnected(connected);
    onConnectionStatusChange?.(status, connected);
  }, [onConnectionStatusChange]);
  
  // Connect to socket and join chat room
  const connectAndJoin = useCallback(async () => {
    try {
      // Reset error state
      setError(null);
      
      // Check if we have necessary IDs
      if (!chatId && !bookingId) {
        setError('No chat ID or booking ID provided');
        updateConnectionStatus('Missing chat or booking ID', false);
        return;
      }
      
      // Connect to socket
      updateConnectionStatus('Connecting to chat server...', false);
      const socket = await enhancedSocketService.connectSocket();
      
      if (!socket) {
        setError('Failed to connect to chat server');
        updateConnectionStatus('Connection failed', false);
        return;
      }
      
      updateConnectionStatus('Connected to server, joining chat...', true);
      
      // Join chat room
      setIsJoining(true);
      setJoinAttempts(prev => prev + 1);
      
      const joinResult = await enhancedSocketService.enhancedJoinChatRoom(
        chatId || '',
        bookingId || '',
        {
          timeout: 15000,
          retryCount: 3,
          retryDelay: 2000,
          onProgress: (status) => {
            updateConnectionStatus(`Joining: ${status}`, true);
          }
        }
      );
      
      setIsJoining(false);
      
      if (joinResult.success) {
        updateConnectionStatus('Connected to chat room', true);
        onJoinSuccess?.(joinResult.data);
      } else {
        setError(joinResult.error || 'Failed to join chat room');
        updateConnectionStatus(`Join failed: ${joinResult.error}`, false);
        onJoinError?.(joinResult.error || 'Unknown error');
      }
    } catch (error) {
      setIsJoining(false);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      updateConnectionStatus(`Error: ${errorMessage}`, false);
      onJoinError?.(errorMessage);
    }
  }, [chatId, bookingId, updateConnectionStatus, onJoinSuccess, onJoinError]);
  
  // Reconnect on connection loss
  const handleReconnect = useCallback(() => {
    if (joinAttempts < 5) {
      updateConnectionStatus('Reconnecting...', false);
      connectAndJoin();
    } else {
      updateConnectionStatus('Max reconnection attempts reached', false);
      setError('Failed to connect after multiple attempts');
    }
  }, [connectAndJoin, joinAttempts, updateConnectionStatus]);
  
  // Connect on component mount if autoConnect is true
  useEffect(() => {
    if (autoConnect) {
      connectAndJoin();
    }
    
    // Check socket connection status periodically
    const interval = setInterval(() => {
      const connected = enhancedSocketService.isSocketConnected();
      if (isConnected && !connected) {
        updateConnectionStatus('Connection lost, reconnecting...', false);
        handleReconnect();
      }
    }, 10000);
    
    return () => {
      clearInterval(interval);
    };
  }, [autoConnect, connectAndJoin, handleReconnect, isConnected, updateConnectionStatus]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect the socket on unmount as it may be needed by other components
      // Just remove any chat-specific listeners
    };
  }, []);
  
  // Render connection status
  const renderStatus = () => {
    if (!showStatus) return null;
    
    return (
      <View style={styles.statusContainer}>
        <View style={[styles.statusIndicator, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]} />
        <Text style={styles.statusText}>{connectionStatus}</Text>
        {isJoining && <ActivityIndicator size="small" color="#0088cc" style={styles.loader} />}
      </View>
    );
  };
  
  return (
    <View style={styles.container}>
      {renderStatus()}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%'
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
    marginBottom: 8
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8
  },
  statusText: {
    fontSize: 12,
    color: '#555',
    flex: 1
  },
  loader: {
    marginLeft: 8
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 4
  }
});

export default ChatConnectionManager;
