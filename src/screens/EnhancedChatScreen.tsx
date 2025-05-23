import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import ChatConnectionManager from '../components/ChatConnectionManager';
import ChatMessageSender from '../components/ChatMessageSender';
import * as enhancedSocketService from '../services/enhancedSocketService';
import { API_URL } from '../config';
import axios from 'axios';

// Define message type
interface Message {
  _id: string;
  sender: string;
  senderType: 'user' | 'astrologer';
  message: string;
  timestamp: string;
  read: boolean;
}

const EnhancedChatScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { user, token } = useAuth();
  
  // Get chatId and bookingId from route params
  const chatId = route.params?.chatId;
  const bookingId = route.params?.bookingId;
  
  // State for messages and loading
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');
  const [isConnected, setIsConnected] = useState(false);
  
  // Fetch messages from API
  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!token) {
        setError('Authentication required');
        setLoading(false);
        return;
      }
      
      // Determine which endpoint to use
      let endpoint = '';
      if (chatId) {
        endpoint = `${API_URL}/chats/${chatId}/messages`;
      } else if (bookingId) {
        endpoint = `${API_URL}/chats/booking/${bookingId}/messages`;
      } else {
        setError('No chat ID or booking ID provided');
        setLoading(false);
        return;
      }
      
      // Fetch messages
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.status === 200) {
        // Process messages
        const fetchedMessages = response.data.data || response.data.messages || [];
        setMessages(fetchedMessages);
        
        // If we got a chatId from the response and didn't have one before, save it
        if (!chatId && response.data.chatId) {
          // Update navigation params
          navigation.setParams({ chatId: response.data.chatId });
        }
      } else {
        setError('Failed to fetch messages');
      }
    } catch (error) {
      setError('Error fetching messages');
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle new message received
  const handleNewMessage = (messageData: any) => {
    if (!messageData || !messageData.message) return;
    
    setMessages(prevMessages => {
      // Check if message already exists
      const exists = prevMessages.some(msg => msg._id === messageData.message._id);
      if (exists) return prevMessages;
      
      // Add new message
      return [...prevMessages, messageData.message];
    });
    
    // Mark messages as read
    if (chatId) {
      const socket = enhancedSocketService.getSocket();
      socket?.emit('chat:markRead', { chatId });
    }
  };
  
  // Handle connection status change
  const handleConnectionStatusChange = (status: string, connected: boolean) => {
    setConnectionStatus(status);
    setIsConnected(connected);
  };
  
  // Handle join success
  const handleJoinSuccess = (data: any) => {
    console.log('Successfully joined chat room:', data);
    
    // If we got a chatId from the join response and didn't have one before, save it
    if (!chatId && data.chatId) {
      // Update navigation params
      navigation.setParams({ chatId: data.chatId });
    }
    
    // Fetch messages
    fetchMessages();
    
    // Set up socket event listeners
    const socket = enhancedSocketService.getSocket();
    if (socket) {
      // Remove existing listeners to prevent duplicates
      socket.off('chat:newMessage');
      
      // Add listener for new messages
      socket.on('chat:newMessage', handleNewMessage);
    }
  };
  
  // Handle join error
  const handleJoinError = (error: string) => {
    console.error('Error joining chat room:', error);
    setError(`Connection error: ${error}`);
    
    // Try to fetch messages anyway via API
    fetchMessages();
  };
  
  // Handle message sent
  const handleMessageSent = (message: string, messageId: string) => {
    // Add the sent message to the messages list
    const newMessage: Message = {
      _id: messageId,
      sender: user?.id || '',
      senderType: 'astrologer',
      message,
      timestamp: new Date().toISOString(),
      read: false
    };
    
    setMessages(prevMessages => [...prevMessages, newMessage]);
  };
  
  // Render a message item
  const renderMessageItem = ({ item }: { item: Message }) => {
    const isAstrologerMessage = item.senderType === 'astrologer';
    
    return (
      <View style={[
        styles.messageContainer,
        isAstrologerMessage ? styles.astrologerMessageContainer : styles.userMessageContainer
      ]}>
        <Text style={[
          styles.messageText,
          isAstrologerMessage ? styles.astrologerMessageText : styles.userMessageText
        ]}>
          {item.message}
        </Text>
        <Text style={[
          styles.timestampText,
          isAstrologerMessage ? styles.astrologerTimestampText : styles.userTimestampText
        ]}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {isAstrologerMessage && (item.read ? ' ✓✓' : ' ✓')}
        </Text>
      </View>
    );
  };
  
  // Render the chat screen
  return (
    <SafeAreaView style={styles.container}>
      <ChatConnectionManager
        chatId={chatId}
        bookingId={bookingId}
        onConnectionStatusChange={handleConnectionStatusChange}
        onJoinSuccess={handleJoinSuccess}
        onJoinError={handleJoinError}
        autoConnect={true}
        showStatus={true}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0088cc" />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet. Start the conversation!</Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            renderItem={renderMessageItem}
            keyExtractor={item => item._id}
            contentContainerStyle={styles.messagesContainer}
            inverted={false}
          />
        )}
        
        <ChatMessageSender
          chatId={chatId}
          bookingId={bookingId}
          onMessageSent={handleMessageSent}
          onError={setError}
          disabled={!isConnected}
        />
      </ChatConnectionManager>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    color: '#666'
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#FFEBEE',
    margin: 8,
    borderRadius: 8
  },
  errorText: {
    color: '#F44336'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  emptyText: {
    color: '#666',
    textAlign: 'center'
  },
  messagesContainer: {
    padding: 8
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 4
  },
  userMessageContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4
  },
  astrologerMessageContainer: {
    alignSelf: 'flex-end',
    backgroundColor: '#DCF8C6',
    borderBottomRightRadius: 4
  },
  messageText: {
    fontSize: 16
  },
  userMessageText: {
    color: '#000'
  },
  astrologerMessageText: {
    color: '#000'
  },
  timestampText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end'
  },
  userTimestampText: {
    color: '#999'
  },
  astrologerTimestampText: {
    color: '#7CB342'
  }
});

export default EnhancedChatScreen;
