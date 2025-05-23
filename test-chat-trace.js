/**
 * Chat Flow Trace Script for Astrologer App
 * 
 * This script tests a complete chat flow with detailed logging of all API interactions,
 * including full URLs, headers, tokens, astrologer IDs, and booking IDs.
 */

const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt for input
const prompt = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// Create log directory and file
const setupLogging = () => {
  const logDirectory = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const logFilePath = path.join(logDirectory, `chat-trace-${timestamp}.log`);
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  
  // Create a logger that writes to both console and file
  const logger = (message) => {
    console.log(message);
    logStream.write(message + '\n');
  };
  
  return { logger, logFilePath };
};

// Parse JWT token to get user info
const parseJwt = (token) => {
  try {
    if (!token) return null;
    
    // Remove 'Bearer ' if present
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }
    
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Error parsing JWT:', e);
    return null;
  }
};

// Function to test the complete chat flow
const testChatFlow = async (baseUrl, token, astrologerId, bookingId, logger) => {
  // Log test information
  logger('\n============= CHAT FLOW TRACE =============');
  logger(`Timestamp: ${new Date().toISOString()}`);
  logger(`API URL: ${baseUrl}`);
  logger(`Astrologer ID: ${astrologerId}`);
  logger(`Booking ID: ${bookingId}`);
  
  // Parse JWT for additional info
  const tokenData = parseJwt(token);
  if (tokenData) {
    logger(`Token user ID: ${tokenData._id || 'N/A'}`);
    logger(`Token role: ${tokenData.role || 'N/A'}`);
    logger(`Token expiry: ${new Date(tokenData.exp * 1000).toISOString()}`);
  }
  
  // Set up standard headers
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-App-Identifier': 'astrologer-app',
    'X-Astrologer-ID': astrologerId,
    'X-Sender-ID': astrologerId,
    'X-User-ID': astrologerId
  };
  
  logger('\nUsing Headers:');
  Object.entries(headers).forEach(([key, value]) => {
    logger(`${key}: ${key === 'Authorization' ? value.substring(0, 20) + '...' : value}`);
  });
  
  // Test Phase 1: Check if chat already exists for the booking
  logger('\n=== PHASE 1: Check Existing Chat ===');
  let existingChatId = null;
  
  try {
    const checkEndpoint = `/api/chats/booking/${bookingId}`;
    logger(`Checking for existing chat: GET ${baseUrl}${checkEndpoint}`);
    
    const response = await axios.get(`${baseUrl}${checkEndpoint}`, { headers });
    logger(`✅ Chat exists! Status: ${response.status}`);
    
    if (response.data?.data?._id) {
      existingChatId = response.data.data._id;
      logger(`📝 Existing chat ID: ${existingChatId}`);
    } else {
      logger('⚠️ Chat exists but could not extract chat ID from response');
    }
  } catch (error) {
    logger(`❌ No existing chat found: ${error.message}`);
    if (error.response) {
      logger(`Status: ${error.response.status}`);
    }
  }
  
  // Test Phase 2: Create a new chat if none exists
  let chatId = existingChatId;
  if (!chatId) {
    logger('\n=== PHASE 2: Create New Chat ===');
    
    // Try with /api prefix first
    const createEndpoint = `/api/chats/booking/${bookingId}/messages`;
    logger(`Creating chat: POST ${baseUrl}${createEndpoint}`);
    
    const payload = {
      message: 'Hello, I am ready to start your consultation.',
      senderType: 'astrologer',
      astrologerId: astrologerId,
      senderId: astrologerId
    };
    
    logger(`Payload: ${JSON.stringify(payload)}`);
    
    try {
      const response = await axios.post(`${baseUrl}${createEndpoint}`, payload, { headers });
      logger(`✅ Chat created! Status: ${response.status}`);
      
      // Extract chat ID from response
      if (response.data?.data?.chatId) {
        chatId = response.data.data.chatId;
      } else if (response.data?.data?.chat?._id) {
        chatId = response.data.data.chat._id;
      } else if (response.data?.chatId) {
        chatId = response.data.chatId;
      }
      
      if (chatId) {
        logger(`📝 New chat ID: ${chatId}`);
      } else {
        logger('⚠️ Chat created but could not extract chat ID from response');
        logger(`Response data: ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      logger(`❌ Failed to create chat: ${error.message}`);
      if (error.response) {
        logger(`Status: ${error.response.status}`);
        logger(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      
      // If creation fails, try direct chat creation
      try {
        logger('\nTrying direct chat creation...');
        const directEndpoint = `/api/chats`;
        logger(`Creating chat directly: POST ${baseUrl}${directEndpoint}`);
        
        const directPayload = {
          bookingId,
          astrologerId,
          initialMessage: 'Hello, I am ready to start your consultation.'
        };
        
        const directResponse = await axios.post(`${baseUrl}${directEndpoint}`, directPayload, { headers });
        logger(`✅ Chat created directly! Status: ${directResponse.status}`);
        
        if (directResponse.data?.data?._id) {
          chatId = directResponse.data.data._id;
          logger(`📝 New chat ID from direct creation: ${chatId}`);
        } else {
          logger('⚠️ Chat created but could not extract chat ID from response');
        }
      } catch (directError) {
        logger(`❌ Direct chat creation also failed: ${directError.message}`);
        if (directError.response) {
          logger(`Status: ${directError.response.status}`);
          logger(`Response data: ${JSON.stringify(directError.response.data)}`);
        }
      }
    }
  }
  
  // If we still don't have a chat ID, we can't continue
  if (!chatId) {
    logger('❌ Failed to get or create a chat. Cannot continue with testing.');
    return false;
  }
  
  // Test Phase 3: Get chat by ID
  logger('\n=== PHASE 3: Get Chat by ID ===');
  try {
    const getEndpoint = `/api/chats/${chatId}`;
    logger(`Getting chat by ID: GET ${baseUrl}${getEndpoint}`);
    
    const response = await axios.get(`${baseUrl}${getEndpoint}`, { headers });
    logger(`✅ Successfully retrieved chat! Status: ${response.status}`);
    
    // Log basic info about the chat
    if (response.data?.data) {
      const chat = response.data.data;
      logger(`📝 Chat info:`);
      logger(`- ID: ${chat._id}`);
      logger(`- Booking ID: ${chat.booking?._id || 'N/A'}`);
      logger(`- User ID: ${chat.user?._id || 'N/A'}`);
      logger(`- Astrologer ID: ${chat.astrologer || 'N/A'}`);
      logger(`- Active: ${chat.isActive}`);
      logger(`- Message count: ${chat.messages?.length || 0}`);
    }
  } catch (error) {
    logger(`❌ Failed to get chat by ID: ${error.message}`);
    if (error.response) {
      logger(`Status: ${error.response.status}`);
      
      // Try without /api prefix if first attempt fails
      if (error.response.status === 404) {
        try {
          const altEndpoint = `/chats/${chatId}`;
          logger(`\nTrying alternative endpoint: GET ${baseUrl}${altEndpoint}`);
          
          const altResponse = await axios.get(`${baseUrl}${altEndpoint}`, { headers });
          logger(`✅ Successfully retrieved chat from alternative endpoint! Status: ${altResponse.status}`);
        } catch (altError) {
          logger(`❌ Alternative endpoint also failed: ${altError.message}`);
        }
      }
    }
  }
  
  // Test Phase 4: Send a message to the chat
  logger('\n=== PHASE 4: Send a Message ===');
  
  try {
    // Use the booking ID endpoint for sending messages
    const messageEndpoint = `/api/chats/booking/${bookingId}/messages`;
    logger(`Sending message: POST ${baseUrl}${messageEndpoint}`);
    
    const messagePayload = {
      message: `Test message from chat trace script at ${new Date().toISOString()}`,
      senderType: 'astrologer',
      astrologerId: astrologerId,
      messageType: 'text'
    };
    
    const response = await axios.post(`${baseUrl}${messageEndpoint}`, messagePayload, { headers });
    logger(`✅ Message sent successfully! Status: ${response.status}`);
    
    if (response.data?.data) {
      logger(`📝 Message ID: ${response.data.data._id || 'N/A'}`);
      logger(`📝 Timestamp: ${response.data.data.timestamp || 'N/A'}`);
    }
  } catch (error) {
    logger(`❌ Failed to send message: ${error.message}`);
    if (error.response) {
      logger(`Status: ${error.response.status}`);
      logger(`Response data: ${JSON.stringify(error.response.data)}`);
      
      // Try alternative endpoint
      if (error.response.status === 404) {
        try {
          const altEndpoint = `/chats/booking/${bookingId}/messages`;
          logger(`\nTrying alternative endpoint: POST ${baseUrl}${altEndpoint}`);
          
          const messagePayload = {
            message: `Test message from chat trace script (alternative endpoint) at ${new Date().toISOString()}`,
            senderType: 'astrologer',
            astrologerId: astrologerId,
            messageType: 'text'
          };
          
          const altResponse = await axios.post(`${baseUrl}${altEndpoint}`, messagePayload, { headers });
          logger(`✅ Message sent successfully via alternative endpoint! Status: ${altResponse.status}`);
        } catch (altError) {
          logger(`❌ Alternative endpoint also failed: ${altError.message}`);
        }
      }
    }
  }
  
  // Test Phase 5: Get chat messages
  logger('\n=== PHASE 5: Get Chat Messages ===');
  
  try {
    // Use the booking ID for fetching messages
    const messagesEndpoint = `/api/chats/booking/${bookingId}`;
    logger(`Fetching messages: GET ${baseUrl}${messagesEndpoint}`);
    
    const response = await axios.get(`${baseUrl}${messagesEndpoint}`, { headers });
    logger(`✅ Successfully retrieved messages! Status: ${response.status}`);
    
    // Log message count
    if (response.data?.data?.messages) {
      logger(`📝 Messages count: ${response.data.data.messages.length}`);
    } else if (response.data?.data && Array.isArray(response.data.data)) {
      logger(`📝 Messages count: ${response.data.data.length}`);
    } else {
      logger(`⚠️ No messages found in response`);
    }
  } catch (error) {
    logger(`❌ Failed to fetch messages: ${error.message}`);
    if (error.response) {
      logger(`Status: ${error.response.status}`);
      
      // Try alternative endpoint
      if (error.response.status === 404) {
        try {
          const altEndpoint = `/chats/booking/${bookingId}`;
          logger(`\nTrying alternative endpoint: GET ${baseUrl}${altEndpoint}`);
          
          const altResponse = await axios.get(`${baseUrl}${altEndpoint}`, { headers });
          logger(`✅ Successfully retrieved messages via alternative endpoint! Status: ${altResponse.status}`);
        } catch (altError) {
          logger(`❌ Alternative endpoint also failed: ${altError.message}`);
        }
      }
    }
  }
  
  logger('\n========== CHAT FLOW TRACE COMPLETE ==========');
  return true;
};

// Main function
const main = async () => {
  try {
    // Setup logging
    const { logger, logFilePath } = setupLogging();
    
    logger('=== Chat Flow Trace Tool ===');
    logger(`Logs will be saved to: ${logFilePath}`);
    
    // Get input parameters
    const baseUrl = await prompt('Enter the API base URL (e.g., http://localhost:3002): ');
    const token = await prompt('Enter your JWT token: ');
    const astrologerId = await prompt('Enter your astrologer ID: ');
    const bookingId = await prompt('Enter a booking ID to test: ');
    
    if (!baseUrl || !token || !astrologerId || !bookingId) {
      logger('❌ All parameters are required!');
      rl.close();
      return;
    }
    
    await testChatFlow(baseUrl, token, astrologerId, bookingId, logger);
    
    logger(`\nTrace complete! Full logs saved to: ${logFilePath}`);
    rl.close();
  } catch (error) {
    console.error('Unexpected error:', error);
    rl.close();
  }
};

// Run the script
if (require.main === module) {
  main();
}

module.exports = { testChatFlow }; 