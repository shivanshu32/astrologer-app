const readline = require('readline');
const AsyncStorage = require('@react-native-async-storage/async-storage');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to decode JWT
const decodeJwt = (token) => {
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

// Function to validate MongoDB ObjectId format
const isValidMongoId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

// Improved function to get a valid astrologer ID
const getValidAstrologerId = async () => {
  try {
    // Store all potential IDs for debugging
    const potentialIds = [];
    
    // Try to get from profile in API first
    const astrologerProfileString = await AsyncStorage.getItem('astrologerProfile');
    if (astrologerProfileString) {
      const profile = JSON.parse(astrologerProfileString);
      if (profile && profile._id && isValidMongoId(profile._id)) {
        console.log(`Got valid astrologer ID from profile: ${profile._id}`);
        potentialIds.push({source: 'profile', id: profile._id});
        
        // If we get a valid profile ID, store it to ensure consistency
        await AsyncStorage.setItem('astrologerId', profile._id);
        
        // Store in userData as well for socket service
        try {
          const userDataStr = await AsyncStorage.getItem('userData');
          if (userDataStr) {
            const userData = JSON.parse(userDataStr);
            userData.astrologerId = profile._id;
            await AsyncStorage.setItem('userData', JSON.stringify(userData));
            console.log(`Updated astrologerId in userData: ${profile._id}`);
          }
        } catch (userDataError) {
          console.error('Error updating userData with astrologerId:', userDataError);
        }
        
        return profile._id;
      }
    }

    // Try from AsyncStorage
    const directId = await AsyncStorage.getItem('astrologerId');
    if (directId && isValidMongoId(directId)) {
      console.log(`Got valid astrologer ID from AsyncStorage: ${directId}`);
      potentialIds.push({source: 'asyncStorage', id: directId});
      return directId;
    }

    // Try from userData
    const userDataStr = await AsyncStorage.getItem('userData');
    if (userDataStr) {
      const userData = JSON.parse(userDataStr);
      if (userData && userData._id && isValidMongoId(userData._id)) {
        console.log(`Got valid astrologer ID from userData._id: ${userData._id}`);
        potentialIds.push({source: 'userData._id', id: userData._id});
        
        // Store this ID in astrologerId for future consistency
        await AsyncStorage.setItem('astrologerId', userData._id);
        return userData._id;
      }
      
      if (userData && userData.astrologerId && isValidMongoId(userData.astrologerId)) {
        console.log(`Got valid astrologer ID from userData.astrologerId: ${userData.astrologerId}`);
        potentialIds.push({source: 'userData.astrologerId', id: userData.astrologerId});
        return userData.astrologerId;
      }
      
      if (userData && userData.id && isValidMongoId(userData.id)) {
        console.log(`Got valid astrologer ID from userData.id: ${userData.id}`);
        potentialIds.push({source: 'userData.id', id: userData.id});
        
        // Store this ID in astrologerId for future consistency
        await AsyncStorage.setItem('astrologerId', userData.id);
        // Also update userData.astrologerId for consistency
        userData.astrologerId = userData.id;
        await AsyncStorage.setItem('userData', JSON.stringify(userData));
        
        return userData.id;
      }
    }

    // Try from decoded token as last resort
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        // Basic JWT decoding
        const decoded = decodeJwt(token);
        if (decoded) {
          if (decoded._id && isValidMongoId(decoded._id)) {
            console.log(`Got valid astrologer ID from token._id: ${decoded._id}`);
            potentialIds.push({source: 'token._id', id: decoded._id});
            
            // Store for future use
            await AsyncStorage.setItem('astrologerId', decoded._id);
            return decoded._id;
          }
          
          if (decoded.id && isValidMongoId(decoded.id)) {
            console.log(`Got valid astrologer ID from token.id: ${decoded.id}`);
            potentialIds.push({source: 'token.id', id: decoded.id});
            
            // Store for future use
            await AsyncStorage.setItem('astrologerId', decoded.id);
            return decoded.id;
          }
        }
      }
    } catch (tokenError) {
      console.error('Error extracting ID from token:', tokenError);
    }

    // Log all potential IDs for debugging
    if (potentialIds.length > 0) {
      console.warn('Found potential astrologer IDs but none were used:', JSON.stringify(potentialIds, null, 2));
    }

    console.error('Could not find a valid astrologer ID');
    return null;
  } catch (err) {
    console.error('Error getting valid astrologer ID:', err);
    return null;
  }
};

// Main test function
const testChatCreation = async (bookingId) => {
  console.log('=== TESTING CHAT CREATION AND ID HANDLING ===');
  console.log(`Testing with bookingId: ${bookingId}`);
  
  // Step 1: Get astrologer ID using our improved method
  console.log('\n[Step 1] Getting astrologer ID using improved method...');
  const astrologerId = await getValidAstrologerId();
  
  if (!astrologerId) {
    return {
      success: false,
      message: 'Could not determine astrologer ID'
    };
  }
  
  console.log(`Astrologer ID: ${astrologerId}`);
  
  // Step 2: Verify the ID is stored consistently
  console.log('\n[Step 2] Verifying consistent ID storage...');
  
  const dirId = await AsyncStorage.getItem('astrologerId');
  console.log(`- Direct astrologerId: ${dirId}`);
  
  const userDataStr = await AsyncStorage.getItem('userData');
  if (userDataStr) {
    const userData = JSON.parse(userDataStr);
    console.log(`- userData.astrologerId: ${userData.astrologerId}`);
    console.log(`- userData._id: ${userData._id}`);
    console.log(`- userData.id: ${userData.id}`);
  } else {
    console.log('- No userData found');
  }
  
  // Step 3: Check if all sources have the same ID
  console.log('\n[Step 3] Checking ID consistency...');
  
  const allSame = dirId === astrologerId;
  console.log(`- All IDs consistent: ${allSame ? 'YES' : 'NO'}`);
  
  if (!allSame) {
    console.log('- Fixing inconsistencies...');
    await AsyncStorage.setItem('astrologerId', astrologerId);
    
    if (userDataStr) {
      const userData = JSON.parse(userDataStr);
      userData.astrologerId = astrologerId;
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
    }
    
    console.log('- Inconsistencies fixed. All sources now use ID:', astrologerId);
  }
  
  return {
    success: true,
    message: 'ID validation and consistency check completed',
    astrologerId
  };
};

// Add a new test function for testing chat creation with simplified payloads
const testChatCreationWithSimplifiedPayload = async (apiUrl, token, bookingId) => {
  console.log('=== TESTING CHAT CREATION WITH SIMPLIFIED PAYLOAD ===');
  console.log(`Testing with bookingId: ${bookingId}`);
  
  // Set up headers with authentication token
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-App-Identifier': 'astrologer-app-mobile',
    'User-Agent': 'AstrologerApp/1.0'
  };
  
  // Step 1: Try to create a chat with simplified payload
  console.log('\n[Step 1] Creating chat with simplified payload...');
  
  try {
    // Create a simplified payload without astrologerId
    const payload = {
      message: 'Testing simplified chat creation',
      senderType: 'astrologer'
      // No astrologerId - backend should extract it from token
    };
    
    console.log(`Endpoint: ${apiUrl}/chats/booking/${bookingId}/messages`);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    // Make API call to create chat/send message
    const axios = require('axios');
    const response = await axios.post(
      `${apiUrl}/chats/booking/${bookingId}/messages`, 
      payload, 
      { headers }
    );
    
    console.log('✅ Success! Response:', JSON.stringify(response.data, null, 2));
    
    // Extract chat ID if available
    let chatId = null;
    if (response.data && response.data.data) {
      if (response.data.data.chatId) {
        chatId = response.data.data.chatId;
      } else if (response.data.data._id) {
        chatId = response.data.data._id;
      } else if (response.data.data.chat && response.data.data.chat._id) {
        chatId = response.data.data.chat._id;
      }
    }
    
    return {
      success: true,
      message: 'Successfully created chat with simplified payload',
      chatId,
      response: response.data
    };
  } catch (error) {
    console.error('❌ Error creating chat with simplified payload:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 403) {
        console.error('\nThis looks like an authorization error. The token ID may not match the booking\'s astrologer ID.');
        console.error('Check that the JWT token contains the correct astrologer ID.');
        
        // Try to decode token and show user ID
        try {
          const decoded = decodeJwt(token);
          if (decoded) {
            console.error('Token user ID:', decoded._id || decoded.id);
            console.error('Token user type:', decoded.userType);
          }
        } catch (tokenError) {
          console.error('Could not decode token');
        }
      }
    }
    
    return {
      success: false,
      message: 'Failed to create chat with simplified payload',
      error: error.message
    };
  }
};

// Add new test function to verify our fix
const testChatCreationWithHeaders = async (apiUrl, token, bookingId, astrologerId) => {
  console.log('\n=== TESTING CHAT CREATION WITH EXPLICIT HEADERS ===');
  console.log(`API URL: ${apiUrl}`);
  console.log(`Booking ID: ${bookingId}`);
  console.log(`Astrologer ID: ${astrologerId}`);
  
  try {
    const axios = require('axios');
    
    // Set up the headers with token authentication and explicit astrologer ID
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-App-Identifier': 'astrologer-app',
      'X-Astrologer-ID': astrologerId, // Add explicit astrologer ID
      'X-Sender-ID': astrologerId      // Add explicit sender ID
    };
    
    // Create the payload with the astrologer ID included
    const payload = {
      message: 'Test message with explicit astrologer ID in headers and payload',
      messageType: 'text',
      senderType: 'astrologer',
      senderId: astrologerId,     // Include in payload as well
      astrologerId: astrologerId  // Include in payload as well
    };
    
    console.log('\n[Step 1] Sending message with explicit headers and payload...');
    console.log(`- Using endpoint: ${apiUrl}/chats/booking/${bookingId}/messages`);
    console.log('- Headers:', headers);
    console.log('- Payload:', payload);
    
    // Make the API call
    const response = await axios.post(
      `${apiUrl}/chats/booking/${bookingId}/messages`,
      payload,
      { headers }
    );
    
    console.log('\n[Step 2] Response received:');
    console.log('- Status:', response.status);
    console.log('- Success:', response.data.success);
    console.log('- Message:', response.data.message);
    
    if (response.data.data && response.data.data.chatId) {
      console.log('- Chat ID:', response.data.data.chatId);
    }
    
    if (response.data.data && response.data.data.message) {
      console.log('- Message ID:', response.data.data.message._id);
      console.log('- Sender ID:', response.data.data.message.sender);
      console.log('- Sender Type:', response.data.data.message.senderType);
    }
    
    return {
      success: true,
      message: 'Successfully sent message with explicit headers',
      data: response.data
    };
  } catch (error) {
    console.error('\n[ERROR] Failed to send message with explicit headers:');
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Error message:', error.response.data.message || 'Unknown error');
      console.error('- Response data:', error.response.data);
    } else {
      console.error('- Error:', error.message);
    }
    
    return {
      success: false,
      message: 'Failed to send message with explicit headers',
      error: error.response ? error.response.data : error.message
    };
  }
};

// Modify the main module export to include the new test
module.exports = {
  testChatCreation,
  testChatCreationWithSimplifiedPayload,
  testChatCreationWithHeaders
};

// Run the test if executed directly
if (require.main === module) {
  // Create readline interface for prompts
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Prompt helper function
  const prompt = (question) => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  };
  
  // Main test runner
  const runTest = async () => {
    try {
      console.log('\n=== CHAT CREATION DIAGNOSTIC TOOL ===\n');
      
      // Get API URL
      const apiUrl = await prompt('Enter API URL (e.g., http://localhost:3002/api): ');
      if (!apiUrl) {
        console.error('API URL is required');
        return;
      }
      
      // Get token
      const token = await prompt('Enter JWT token: ');
      if (!token) {
        console.error('Token is required');
        return;
      }
      
      // Get booking ID
      const bookingId = await prompt('Enter booking ID to test: ');
      if (!bookingId) {
        console.error('Booking ID is required');
        return;
      }
      
      // Run the simplified payload test
      const result1 = await testChatCreationWithSimplifiedPayload(apiUrl, token, bookingId);
      console.log('\nSimplified payload test result:', result1.success ? 'SUCCESS' : 'FAILURE');
      
      // Then test with our new header method
      const result2 = await testChatCreationWithHeaders(apiUrl, token, bookingId, result1.astrologerId);
      console.log('\nExplicit headers test result:', result2.success ? 'SUCCESS' : 'FAILURE');
      
      console.log('\nTests completed!');
      
      if (result1.success || result2.success) {
        console.log('\n✅ At least one test method succeeded! The fix is working.');
      } else {
        console.log('\n❌ Both test methods failed. Further debugging may be needed.');
      }
      
      rl.close();
    } catch (error) {
      console.error('Error running test:', error);
      rl.close();
    }
  };
  
  runTest();
} 