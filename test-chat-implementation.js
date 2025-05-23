const axios = require('axios');
const readline = require('readline');
const fs = require('fs');

// Configuration
const API_URL = 'https://api.yourdomain.com/api'; // Replace with your actual API URL

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility to prompt for input
const prompt = (query) => new Promise((resolve) => rl.question(query, resolve));

// Debug logging utility
const log = (message, data = null) => {
  console.log('\n=== ' + message + ' ===');
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
  console.log('======' + '='.repeat(message.length) + '======\n');
};

// Main test function
async function testChatImplementation() {
  console.log('\n🔍 TESTING ASTROLOGER APP CHAT IMPLEMENTATION 🔍\n');
  
  try {
    // Get user input for testing
    const token = await prompt('Enter your astrologer auth token: ');
    const astrologerId = await prompt('Enter your astrologer ID: ');
    const bookingId = await prompt('Enter a booking ID to test with: ');
    
    // Set up API client with auth headers
    const api = axios.create({
      baseURL: API_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Identifier': 'astrologer-app',
        'X-Astrologer-ID': astrologerId
      }
    });
    
    // Test 1: Check if chat exists for this booking
    log('1. CHECKING IF CHAT EXISTS FOR BOOKING', { bookingId });
    let existingChatId = null;
    
    try {
      // Use the /chats endpoint (same as user-app)
      const chatResponse = await api.get(`/chats/booking/${bookingId}`);
      log('EXISTING CHAT FOUND', chatResponse.data);
      
      if (chatResponse.data && chatResponse.data.data && chatResponse.data.data._id) {
        existingChatId = chatResponse.data.data._id;
        log('EXISTING CHAT ID', { chatId: existingChatId });
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('NO EXISTING CHAT FOUND FOR THIS BOOKING', { status: 404 });
      } else {
        log('ERROR CHECKING FOR EXISTING CHAT', {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });
      }
    }
    
    // Test 2: If no chat exists, create one
    if (!existingChatId) {
      log('2. CREATING NEW CHAT FOR BOOKING', { bookingId });
      
      try {
        // Create chat by sending a message (same as user-app)
        const createResponse = await api.post(`/chats/booking/${bookingId}/messages`, {
          message: 'Hello, this is a test message from the astrologer app.',
          senderType: 'astrologer',
          astrologerId
        });
        
        log('CHAT CREATION RESPONSE', createResponse.data);
        
        // Extract the chat ID
        if (createResponse.data && createResponse.data.data) {
          if (createResponse.data.data.chatId) {
            existingChatId = createResponse.data.data.chatId;
          } else if (createResponse.data.data.chat && createResponse.data.data.chat._id) {
            existingChatId = createResponse.data.data.chat._id;
          } else if (createResponse.data.data._id) {
            existingChatId = createResponse.data.data._id;
          }
          
          if (existingChatId) {
            log('CREATED NEW CHAT', { chatId: existingChatId });
          } else {
            log('FAILED TO EXTRACT CHAT ID FROM RESPONSE');
          }
        }
      } catch (error) {
        log('ERROR CREATING CHAT', {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });
        
        // Try fallback method - creating chat directly
        try {
          log('TRYING FALLBACK CHAT CREATION METHOD');
          const fallbackResponse = await api.post('/chats', {
            bookingId,
            astrologerId
          });
          
          log('FALLBACK CHAT CREATION RESPONSE', fallbackResponse.data);
          
          if (fallbackResponse.data && fallbackResponse.data.data && fallbackResponse.data.data._id) {
            existingChatId = fallbackResponse.data.data._id;
            log('CREATED NEW CHAT WITH FALLBACK METHOD', { chatId: existingChatId });
          }
        } catch (fallbackError) {
          log('FALLBACK CHAT CREATION ALSO FAILED', {
            status: fallbackError.response?.status,
            message: fallbackError.message,
            data: fallbackError.response?.data
          });
        }
      }
    }
    
    // Only continue if we have a chat ID
    if (!existingChatId) {
      log('❌ CANNOT CONTINUE TESTING - NO CHAT ID AVAILABLE');
      return;
    }
    
    // Test 3: Get messages for the chat
    log('3. FETCHING MESSAGES FOR CHAT', { chatId: existingChatId, bookingId });
    
    try {
      // Try booking ID endpoint first (same as user-app)
      const messagesResponse = await api.get(`/chats/booking/${bookingId}`);
      
      if (messagesResponse.data && messagesResponse.data.data) {
        const chatData = messagesResponse.data.data;
        const messages = chatData.messages || [];
        
        log('CHAT DATA FETCHED', {
          chatId: chatData._id,
          messageCount: messages.length,
          firstMessage: messages[0] || null,
          lastMessage: messages.length > 0 ? messages[messages.length - 1] : null
        });
      }
    } catch (error) {
      log('ERROR FETCHING MESSAGES', {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      });
    }
    
    // Test 4: Send a new message
    log('4. SENDING A NEW MESSAGE TO CHAT', { chatId: existingChatId, bookingId });
    
    try {
      // Send a message using the booking ID endpoint (same as user-app)
      const messageResponse = await api.post(`/chats/booking/${bookingId}/messages`, {
        message: `Test message from astrologer at ${new Date().toISOString()}`,
        senderType: 'astrologer',
        astrologerId
      });
      
      log('MESSAGE SEND RESPONSE', messageResponse.data);
      
      // Verify the message was added
      try {
        const verifyResponse = await api.get(`/chats/booking/${bookingId}`);
        const messages = verifyResponse.data.data.messages || [];
        log('UPDATED MESSAGES LIST', {
          messageCount: messages.length,
          lastMessage: messages.length > 0 ? messages[messages.length - 1] : null
        });
      } catch (verifyError) {
        log('ERROR VERIFYING MESSAGE WAS ADDED', {
          status: verifyError.response?.status,
          message: verifyError.message
        });
      }
    } catch (error) {
      log('ERROR SENDING MESSAGE', {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      });
    }
    
    log('✅ CHAT IMPLEMENTATION TESTING COMPLETE');
  } catch (error) {
    console.error('An unexpected error occurred:', error);
  } finally {
    rl.close();
  }
}

// Run the test
testChatImplementation(); 