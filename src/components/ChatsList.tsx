import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  StyleSheet, 
  ActivityIndicator, 
  Image,
  Alert,
  ScrollView,
  Modal
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { chatService } from '../services/chatService';
import AsyncStorage from '@react-native-async-storage/async-storage';

type RootStackParamList = {
  Chat: {
    bookingRequestId: string;
  };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Chat'>;

interface ChatMessage {
  _id: string;
  bookingRequestId: string;
  sender: 'user' | 'astrologer';
  senderId: string;
  message: string;
  timestamp: Date;
  read: boolean;
  readAt?: Date;
}

interface Chatroom {
  _id: string;
  bookingRequestId: string;
  userId: string;
  astrologerId: string;
  status: 'active' | 'inactive';
  startedAt: Date;
  lastMessageAt: Date;
  user?: {
    name: string;
    profilePicture?: string;
  };
  messages?: ChatMessage[];
}

const ChatsList = () => {
  const navigation = useNavigation<NavigationProp>();
  const [chats, setChats] = useState<Chatroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugModalVisible, setDebugModalVisible] = React.useState(false);
  const [apiTestResults, setApiTestResults] = React.useState<any>(null);

  const loadChats = async () => {
    try {
      setLoading(true);
      const chatrooms = await chatService.getAstrologerChats();
      
      // For each chatroom, fetch its messages
      const chatroomsWithMessages = await Promise.all(
        chatrooms.map(async (chatroom: Chatroom) => {
          const messages = await chatService.getChatMessages(chatroom.bookingRequestId);
          return { ...chatroom, messages };
        })
      );
      
      setChats(chatroomsWithMessages);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  const formatLastMessageTime = (timestamp: string | Date) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      return '';
    }
  };

  const getLastMessage = (messages: ChatMessage[] = []) => {
    if (messages.length === 0) {
      return 'No messages yet';
    }
    
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return sortedMessages[0].message;
  };

  const getUnreadCount = (messages: ChatMessage[] = []) => {
    return messages.filter(msg => msg.sender === 'user' && !msg.read).length;
  };

  const handleJoinChat = async (bookingRequestId: string) => {
    try {
      const success = await chatService.joinChat(bookingRequestId);
      
      if (success) {
        navigation.navigate('Chat', { bookingRequestId });
      } else {
        Alert.alert('Error', 'Failed to join chat. Please try again.');
      }
    } catch (error: any) {
      console.error('Error joining chat:', error);
      Alert.alert('Error', 'Failed to join chat. Please try again.');
    }
  };

  const runApiTest = async () => {
    try {
      setApiTestResults(null);
      const results = await chatService.testChatAPI();
      setApiTestResults(results);
      setDebugModalVisible(true);
    } catch (error: any) {
      console.error('Error testing API:', error);
      Alert.alert('Error', `API test failed: ${error.message || 'Unknown error'}`);
    }
  };

  const renderChatItem = ({ item }: { item: Chatroom }) => {
    const lastMessage = getLastMessage(item.messages);
    const unreadCount = getUnreadCount(item.messages);
    const lastMessageTime = item.messages?.length 
      ? formatLastMessageTime(item.messages[item.messages.length - 1].timestamp)
      : formatLastMessageTime(item.lastMessageAt);

    const userName = item.user?.name || 'User';
    const userProfilePicture = item.user?.profilePicture;
    const isWaitingForAstrologer = item.status === 'inactive';

    return (
      <TouchableOpacity
        style={[styles.chatItem, isWaitingForAstrologer && styles.waitingChat]}
        onPress={() => navigation.navigate('Chat', { bookingRequestId: item.bookingRequestId })}
      >
        <View style={styles.avatarContainer}>
          {userProfilePicture ? (
            <Image source={{ uri: userProfilePicture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{userName.charAt(0)}</Text>
            </View>
          )}
          {isWaitingForAstrologer && (
            <View style={styles.waitingBadge}>
              <Text style={styles.waitingBadgeText}>Waiting</Text>
            </View>
          )}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.timeText}>{lastMessageTime}</Text>
          </View>
          
          <View style={styles.messageRow}>
            <Text 
              style={[styles.messageText, unreadCount > 0 && styles.unreadMessage]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {lastMessage}
            </Text>
            
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          
          {isWaitingForAstrologer && (
            <TouchableOpacity 
              style={styles.joinButton}
              onPress={() => handleJoinChat(item.bookingRequestId)}
            >
              <Text style={styles.joinButtonText}>Join Chat</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading chats...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadChats}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (chats.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No active chats</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={chats}
      renderItem={renderChatItem}
      keyExtractor={item => item._id}
      contentContainerStyle={styles.listContainer}
      onRefresh={loadChats}
      refreshing={loading}
    />
  );
};

const styles = StyleSheet.create({
  listContainer: {
    padding: 16,
  },
  chatItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  waitingChat: {
    backgroundColor: '#f8f9fa',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    color: '#757575',
  },
  waitingBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#ffc107',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  waitingBadgeText: {
    fontSize: 10,
    color: '#000',
    fontWeight: '600',
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  timeText: {
    fontSize: 12,
    color: '#757575',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    color: '#757575',
    marginRight: 8,
  },
  unreadMessage: {
    color: '#000',
    fontWeight: '500',
  },
  unreadBadge: {
    backgroundColor: '#6200ee',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: '#6200ee',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#757575',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#6200ee',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
  },
  debugContainer: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    width: '90%',
  },
  debugText: {
    fontSize: 12,
    color: '#D32F2F',
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 16,
  },
  debugButton: {
    backgroundColor: '#FF5722',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  debugButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  debugButtonsContainer: {
    flexDirection: 'row',
    marginTop: 24,
    justifyContent: 'center',
  },
  createTestButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  createTestButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  scrollView: {
    width: '100%',
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
  },
  resultText: {
    fontFamily: 'monospace',
    fontSize: 12,
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  endpointResult: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
  },
  endpointName: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  endpointStatus: {
    marginBottom: 5,
  },
  successText: {
    color: '#4CAF50',
  },
  closeButton: {
    backgroundColor: '#6200ee',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default ChatsList; 