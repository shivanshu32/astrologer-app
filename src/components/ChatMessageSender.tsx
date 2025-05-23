import React, { useState, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as enhancedSocketService from '../services/enhancedSocketService';

interface ChatMessageSenderProps {
  chatId?: string;
  bookingId?: string;
  onMessageSent?: (message: string, messageId: string) => void;
  onError?: (error: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * ChatMessageSender component provides a reliable way to send chat messages
 * It handles message sending with HTTP fallback and provides feedback on message status
 */
const ChatMessageSender: React.FC<ChatMessageSenderProps> = ({
  chatId,
  bookingId,
  onMessageSent,
  onError,
  placeholder = 'Type a message...',
  disabled = false
}) => {
  const [message, setMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  
  // Send message with enhanced reliability
  const sendMessage = useCallback(async () => {
    // Don't send empty messages
    if (!message.trim()) return;
    
    // Check if we have necessary IDs
    if (!chatId && !bookingId) {
      setSendError('No chat ID or booking ID provided');
      onError?.('No chat ID or booking ID provided');
      return;
    }
    
    // Save the message text and clear the input
    const messageText = message;
    setMessage('');
    setSendError(null);
    setIsSending(true);
    
    try {
      // Send message using enhanced socket service
      const result = await enhancedSocketService.sendChatMessage(
        chatId || '',
        bookingId || '',
        messageText
      );
      
      if (result.success) {
        // Message sent successfully
        onMessageSent?.(messageText, result.messageId || '');
      } else {
        // Message failed to send
        setSendError(result.error || 'Failed to send message');
        onError?.(result.error || 'Failed to send message');
        // Restore the message text so the user can try again
        setMessage(messageText);
      }
    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error sending message';
      setSendError(errorMessage);
      onError?.(errorMessage);
      // Restore the message text so the user can try again
      setMessage(messageText);
    } finally {
      setIsSending(false);
    }
  }, [message, chatId, bookingId, onMessageSent, onError]);
  
  return (
    <View style={styles.container}>
      {sendError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{sendError}</Text>
        </View>
      )}
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder={placeholder}
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
          editable={!disabled && !isSending}
          returnKeyType="send"
          onSubmitEditing={Platform.OS === 'ios' ? sendMessage : undefined}
        />
        
        <TouchableOpacity
          style={[
            styles.sendButton,
            (disabled || isSending || !message.trim()) && styles.sendButtonDisabled
          ]}
          onPress={sendMessage}
          disabled={disabled || isSending || !message.trim()}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee'
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8
  },
  errorText: {
    color: '#F44336',
    fontSize: 12
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingRight: 48,
    fontSize: 16
  },
  sendButton: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0088cc',
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc'
  }
});

export default ChatMessageSender;
