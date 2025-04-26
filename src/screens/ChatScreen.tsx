import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';
import { formatDistanceToNow } from 'date-fns';
import { getBookingById } from '../services/bookingService';
import { getUserById } from '../services/userService';
import { chatService } from '../services/chatService';

// Define message type
type Message = {
  _id: string;
  sender: string;
  senderType: 'user' | 'astrologer';
  message: string;
  timestamp: string;
  read: boolean;
  attachments?: Array<{
    type: string;
    url: string;
    mimetype: string;
  }>;
};

// Format message timestamps
const formatMessageTime = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    console.error('Error formatting time:', error);
    return '';
  }
};

const ChatScreen = () => {
  const { user, token } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingData, setBookingData] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList | null>(null);
  
  // Check if we're in a specific booking chat
  const bookingId = route.params?.bookingId;
  
  // Connect to socket server
  const connectSocket = useCallback(() => {
    if (!token) {
      console.error('No token available for socket connection');
      return;
    }
    
    if (socketRef.current?.connected) {
      console.log('Socket already connected');
      return;
    }
    
    setIsConnecting(true);
    
    try {
      // Initialize socket connection with auth token
      socketRef.current = io(API_URL, {
        transports: ['websocket'],
        auth: {
          token,
          astrologerId: user?.profileId // Include astrologerId for faster mapping
        }
      });
      
      socketRef.current.on('connect', () => {
        console.log('Socket connected');
        setIsConnected(true);
        setIsConnecting(false);
        
        // Join chat room if in chat session
        if (chatId) {
          joinChatRoom(chatId);
        } else if (bookingId) {
          // Join room using booking ID
          socketRef.current?.emit('chat:join', { bookingId });
        }
      });
      
      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
      });
      
      socketRef.current.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setIsConnecting(false);
        setError(`Connection error: ${err.message}`);
      });
      
      // Set up chat event listeners
      socketRef.current.on('chat:error', (data) => {
        console.error('Chat error:', data.message);
        Alert.alert('Chat Error', data.message);
      });
      
      socketRef.current.on('chat:joined', (data) => {
        console.log('Joined chat room:', data.roomId);
        setChatId(data.roomId);
      });
      
      socketRef.current.on('chat:newMessage', (data) => {
        console.log('New message received:', data);
        setMessages(prevMessages => [...prevMessages, data.message]);
        
        // Auto-scroll to bottom on new message
        if (flatListRef.current) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
        
        // Mark messages as read
        if (chatId) {
          socketRef.current?.emit('chat:markRead', { chatId });
        }
      });
      
      socketRef.current.on('chat:typing', (data) => {
        if (data.userId !== user?.id) {
          setOtherUserTyping(data.isTyping);
        }
      });
      
      socketRef.current.on('chat:messagesRead', (data) => {
        // Update UI to show that messages have been read
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.senderType === 'astrologer' && !msg.read 
              ? { ...msg, read: true } 
              : msg
          )
        );
      });
      
      // Listen for chat notifications
      socketRef.current.on('chat:notification', (data) => {
        // If we receive a notification but aren't in this chat, show a notification
        if (chatId !== data.chatId && bookingId !== data.bookingId) {
          // React native local notification would go here
          Alert.alert(
            'New Message',
            `${data.message.text}`,
            [
              { 
                text: 'View', 
                onPress: () => navigation.navigate('Chat', { bookingId: data.bookingId }) 
              },
              { text: 'Dismiss', style: 'cancel' }
            ]
          );
        }
      });
    } catch (err) {
      console.error('Error setting up socket connection:', err);
      setError('Failed to connect to chat server. Please try again.');
      setIsConnecting(false);
    }
  }, [token, chatId, bookingId, user?.id, user?.profileId]);
  
  // Join a chat room
  const joinChatRoom = useCallback((roomId: string) => {
    if (!socketRef.current?.connected) {
      console.log('Socket not connected, cannot join room');
      return;
    }
    
    socketRef.current.emit('chat:join', { chatId: roomId });
  }, []);
  
  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!isTyping && chatId) {
      setIsTyping(true);
      socketRef.current?.emit('chat:typing', { chatId, isTyping: true });
    }
    
    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      setIsTyping(false);
      socketRef.current?.emit('chat:typing', { chatId, isTyping: false });
    }, 3000);
    
    setTypingTimeout(timeout);
  }, [isTyping, chatId, typingTimeout]);
  
  // Load booking and chat data
  useEffect(() => {
    const fetchData = async () => {
      if (!bookingId) {
        // If no bookingId, show a list of active bookings/chats
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        
        // Fetch booking data
        const booking = await getBookingById(bookingId);
        setBookingData(booking);
        
        // Fetch user data
        const userData = await getUserById(booking.user);
        setUserData(userData);
        
        // Get or create chat
        const chatData = await chatService.getChatByBookingId(bookingId);
        
        if (chatData) {
          setChatId(chatData._id);
          setMessages(chatData.messages || []);
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load chat data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    // Connect to socket if we have a token
    if (token) {
      connectSocket();
    }
    
    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        console.log('Disconnecting socket');
        
        if (chatId) {
          socketRef.current.emit('chat:leave', { roomId: chatId });
        }
        
        socketRef.current.disconnect();
      }
      
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [bookingId, token, connectSocket]);
  
  // Send a message
  const handleSendMessage = async () => {
    if (messageInput.trim() && bookingId) {
      try {
        const trimmedMessage = messageInput.trim();
        
        // Clear the input first for better UX
        setMessageInput('');
        
        if (chatId) {
          // Send via socket
          socketRef.current?.emit('chat:sendMessage', {
            chatId,
            bookingId,
            message: trimmedMessage
          });
        } else {
          // Create chat first via API then send message
          const newChat = await chatService.createChat(bookingId, user?.id as string);
          
          if (newChat) {
            setChatId(newChat._id);
            
            // Join the room
            socketRef.current?.emit('chat:join', { chatId: newChat._id });
            
            // Send the message after a short delay to ensure we've joined the room
            setTimeout(() => {
              socketRef.current?.emit('chat:sendMessage', {
                chatId: newChat._id,
                bookingId,
                message: trimmedMessage
              });
            }, 300);
          }
        }
        
        // Clear typing state
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }
        setIsTyping(false);
        socketRef.current?.emit('chat:typing', { chatId, isTyping: false });
        
      } catch (err) {
        console.error('Error sending message:', err);
        Alert.alert('Error', 'Failed to send message. Please try again.');
        // Restore the message if send fails
        setMessageInput(messageInput);
      }
    }
  };
  
  if (loading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#0284c7" />
        <Text className="mt-4 text-gray-600">Loading chat...</Text>
      </SafeAreaView>
    );
  }
  
  if (error) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-white p-4">
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text className="mt-4 text-gray-700 text-center">{error}</Text>
        <TouchableOpacity
          className="mt-6 bg-blue-500 rounded-lg py-2 px-6"
          onPress={() => {
            setLoading(true);
            setError(null);
            if (bookingId) {
              navigation.goBack();
            } else {
              connectSocket();
            }
          }}
        >
          <Text className="text-white font-semibold">Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
  
  // Show booking-specific chat if we have a booking ID
  if (bookingId && userData) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <SafeAreaView className="flex-1 bg-gray-100">
          {/* Chat Header */}
          <View className="bg-white p-4 flex-row items-center border-b border-gray-200">
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#374151" />
            </TouchableOpacity>
            
            <View className="flex-row items-center ml-3 flex-1">
              <View className="w-10 h-10 rounded-full bg-blue-100 items-center justify-center">
                <Text className="font-semibold text-blue-600">
                  {userData.name ? userData.name.charAt(0).toUpperCase() : 'U'}
                </Text>
              </View>
              
              <View className="ml-3">
                <Text className="font-semibold text-gray-800">
                  {userData.name || 'User'}
                </Text>
                <Text className="text-xs text-gray-500">
                  {isConnected ? (otherUserTyping ? 'typing...' : 'Online') : 'Offline'}
                </Text>
              </View>
            </View>
            
            {bookingData && (
              <View className="items-end">
                <Text className="text-xs text-gray-500">Booking #{bookingData._id.substring(0, 6)}</Text>
                <View className="flex-row items-center mt-1">
                  <View className={`w-2 h-2 rounded-full ${
                    bookingData.status === 'active' ? 'bg-green-500' : 
                    bookingData.status === 'completed' ? 'bg-blue-500' : 'bg-yellow-500'
                  } mr-1`} />
                  <Text className="text-xs text-gray-500 capitalize">{bookingData.status}</Text>
                </View>
              </View>
            )}
          </View>
          
          {/* Connection Status */}
          {isConnecting && (
            <View className="bg-yellow-100 px-4 py-2">
              <Text className="text-yellow-800 text-xs text-center">Connecting to chat...</Text>
            </View>
          )}
          
          {!isConnected && !isConnecting && (
            <TouchableOpacity 
              className="bg-red-100 px-4 py-2"
              onPress={connectSocket}
            >
              <Text className="text-red-800 text-xs text-center">
                Disconnected from chat. Tap to reconnect.
              </Text>
            </TouchableOpacity>
          )}
          
          {/* Messages List */}
          <FlatList
            ref={flatListRef}
            data={messages}
            className="flex-1 px-4 pt-2"
            keyExtractor={(item, index) => item._id || index.toString()}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={() => (
              <View className="flex-1 justify-center items-center py-10">
                <Text className="text-gray-500 text-center">
                  No messages yet. Start the conversation!
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const isAstrologer = item.senderType === 'astrologer';
              return (
                <View className={`mb-4 flex-row ${isAstrologer ? 'justify-end' : 'justify-start'}`}>
                  <View 
                    className={`max-w-[80%] rounded-lg ${
                      isAstrologer 
                        ? 'bg-blue-500 rounded-br-none' 
                        : 'bg-white rounded-tl-none'
                    } p-3`}
                  >
                    <Text className={isAstrologer ? 'text-white' : 'text-gray-700'}>
                      {item.message}
                    </Text>
                    <View className="flex-row justify-between items-center mt-1">
                      <Text className={`text-xs ${isAstrologer ? 'text-blue-100' : 'text-gray-500'}`}>
                        {formatMessageTime(item.timestamp)}
                      </Text>
                      {isAstrologer && (
                        <Ionicons 
                          name={item.read ? "checkmark-done" : "checkmark"} 
                          size={16} 
                          color={isAstrologer ? "#e2e8f0" : "#9ca3af"} 
                        />
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
            ListFooterComponent={() => (
              otherUserTyping ? (
                <View className="self-start max-w-[80%] mb-4 flex-row">
                  <View className="bg-gray-200 p-2 rounded-lg rounded-tl-none">
                    <View className="flex-row">
                      <View className="h-2 w-2 bg-gray-500 rounded-full mx-0.5 animate-bounce"></View>
                      <View className="h-2 w-2 bg-gray-500 rounded-full mx-0.5 animate-bounce delay-75"></View>
                      <View className="h-2 w-2 bg-gray-500 rounded-full mx-0.5 animate-bounce delay-150"></View>
                    </View>
                  </View>
                </View>
              ) : null
            )}
          />
          
          {/* Message Input */}
          <View className="bg-white p-2 border-t border-gray-200 flex-row items-center">
            <TouchableOpacity className="p-2">
              <Ionicons name="attach" size={24} color="#6B7280" />
            </TouchableOpacity>
            
            <TextInput
              className="flex-1 bg-gray-100 rounded-full px-4 py-2 mx-2 text-gray-700"
              placeholder="Type a message..."
              value={messageInput}
              onChangeText={(text) => {
                setMessageInput(text);
                handleTyping();
              }}
              multiline
            />
            
            <TouchableOpacity 
              className={`${messageInput.trim() ? 'bg-blue-500' : 'bg-gray-300'} w-10 h-10 rounded-full items-center justify-center`}
              onPress={handleSendMessage}
              disabled={!messageInput.trim() || !isConnected}
            >
              <Ionicons name="send" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }
  
  // Show list of active chats if no booking ID provided
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4 border-b border-gray-200">
        <Text className="text-xl font-bold text-gray-800">Chat Sessions</Text>
        <Text className="text-sm text-gray-500">Select a conversation to continue</Text>
      </View>
      
      {/* Implement a list of active chats here */}
      <FlatList
        data={[]}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={() => (
          <View className="flex-1 justify-center items-center py-10">
            <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
            <Text className="mt-4 text-gray-500 text-center">
              No active chat sessions found.
            </Text>
            <Text className="mt-2 text-gray-500 text-center">
              Chat sessions will appear here when users start a consultation.
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity 
            className="p-4 border-b border-gray-100 flex-row items-center"
            onPress={() => navigation.navigate('Chat', { bookingId: item.booking._id })}
          >
            <View className="w-12 h-12 rounded-full bg-blue-100 items-center justify-center">
              <Text className="font-semibold text-blue-600">
                {item.user.name ? item.user.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
            
            <View className="flex-1 ml-3">
              <Text className="font-semibold">{item.user.name}</Text>
              <Text className="text-gray-500 text-sm" numberOfLines={1}>
                {item.lastMessage || 'No messages yet'}
              </Text>
            </View>
            
            <View className="items-end">
              <Text className="text-xs text-gray-500">
                {item.updatedAt ? formatMessageTime(item.updatedAt) : ''}
              </Text>
              {item.unreadCount > 0 && (
                <View className="bg-blue-500 rounded-full w-5 h-5 items-center justify-center mt-1">
                  <Text className="text-xs text-white font-bold">{item.unreadCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
};

export default ChatScreen; 