import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { chatService } from '../services/chatService';

// Define navigation type
type RootStackParamList = {
  Chat: {
    bookingId: string;
    chatId?: string;
  };
  [key: string]: any;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Chat'>;

interface ChatButtonProps {
  bookingId: string;
  userId: string;
  status: string;
  disabled?: boolean;
  style?: any;
}

const ChatButton = ({ bookingId, userId, status, disabled = false, style }: ChatButtonProps) => {
  const navigation = useNavigation<NavigationProp>();
  const [loading, setLoading] = useState(false);

  // Only allow chat for accepted bookings
  const isChatEnabled = status === 'accepted' && !disabled;

  const handlePress = async () => {
    if (!isChatEnabled) {
      Alert.alert(
        'Chat Unavailable',
        'Chat is only available for accepted bookings.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setLoading(true);
      
      // Check if chat already exists
      const existingChat = await chatService.getChatByBookingId(bookingId);
      
      if (existingChat) {
        // Navigate to existing chat
        navigation.navigate('Chat', { 
          bookingId,
          chatId: existingChat._id
        });
      } else {
        // Create a new chat and navigate
        const newChat = await chatService.createChat(bookingId, userId);
        if (newChat) {
          navigation.navigate('Chat', {
            bookingId,
            chatId: newChat._id
          });
        } else {
          throw new Error('Failed to create chat');
        }
      }
    } catch (error) {
      console.error('Error joining chat:', error);
      Alert.alert(
        'Chat Error',
        'Failed to open chat. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        !isChatEnabled && styles.disabledButton,
        style
      ]}
      onPress={handlePress}
      disabled={loading || !isChatEnabled}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <>
          <Ionicons name="chatbubble-outline" size={16} color="#ffffff" />
          <Text style={styles.buttonText}>Chat</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '500',
    fontSize: 14,
  },
});

export default ChatButton; 