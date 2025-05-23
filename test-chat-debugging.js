const axios = require('axios');
const readline = require('readline');

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

// Function to test the chat endpoints
const testChatEndpoints = async (baseUrl, token, astrologerId, bookingId) => {
  console.log('\n=== Testing Chat Endpoints ===');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Astrologer ID: ${astrologerId}`);
  console.log(`Booking ID: ${bookingId}`);

  // Set up standard headers
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-App-Identifier': 'astrologer-app',
    'X-Astrologer-ID': astrologerId,
    'X-Sender-ID': astrologerId,
    'X-User-ID': astrologerId
  };

  console.log('\nTesting chat endpoints with all required headers:', headers);

  // Test endpoints both with and without the /api prefix
  const endpointsToTest = [
    // With /api prefix
    `/api/chats/booking/${bookingId}`,
    `/api/chats/booking/${bookingId}/messages`,
    
    // Without /api prefix
    `/chats/booking/${bookingId}`,
    `/chats/booking/${bookingId}/messages`
  ];

  for (const endpoint of endpointsToTest) {
    console.log(`\nTesting: ${endpoint}`);
    try {
      const response = await axios.get(`${baseUrl}${endpoint}`, { headers });
      console.log(`✅ SUCCESS: Status ${response.status}`);
      console.log(`Response data:`, JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
        console.log(`Response data:`, error.response.data);
      }
    }
  }

  // Test creating a chat
  console.log('\n=== Testing Chat Creation ===');
  try {
    // Try with /api prefix first
    const createEndpoint = `/api/chats/booking/${bookingId}/messages`;
    console.log(`Creating chat via: ${createEndpoint}`);
    
    const payload = {
      message: 'Hello, I am ready to start your consultation.',
      senderType: 'astrologer',
      astrologerId: astrologerId,
      senderId: astrologerId
    };
    
    const response = await axios.post(`${baseUrl}${createEndpoint}`, payload, { headers });
    console.log(`✅ SUCCESS: Status ${response.status}`);
    console.log(`Response data:`, JSON.stringify(response.data, null, 2));
    
    // Extract and save the chat ID
    let chatId = null;
    if (response.data?.data?.chatId) {
      chatId = response.data.data.chatId;
    } else if (response.data?.data?.chat?._id) {
      chatId = response.data.data.chat._id;
    } else if (response.data?.chatId) {
      chatId = response.data.chatId;
    }
    
    if (chatId) {
      console.log(`\nChat ID retrieved: ${chatId}`);
      
      // Now try to get the chat by ID
      console.log(`\n=== Testing Get Chat by ID ===`);
      
      // Try with /api prefix
      try {
        const getByIdEndpoint = `/api/chats/${chatId}`;
        console.log(`Getting chat by ID via: ${getByIdEndpoint}`);
        
        const getResponse = await axios.get(`${baseUrl}${getByIdEndpoint}`, { headers });
        console.log(`✅ SUCCESS: Status ${getResponse.status}`);
        console.log(`Response data:`, JSON.stringify(getResponse.data, null, 2).substring(0, 200) + '...');
      } catch (error) {
        console.log(`❌ FAILED with /api prefix: ${error.message}`);
        
        // Try without /api prefix
        try {
          const altEndpoint = `/chats/${chatId}`;
          console.log(`Getting chat by ID via alternative: ${altEndpoint}`);
          
          const altResponse = await axios.get(`${baseUrl}${altEndpoint}`, { headers });
          console.log(`✅ SUCCESS with alternative: Status ${altResponse.status}`);
          console.log(`Response data:`, JSON.stringify(altResponse.data, null, 2).substring(0, 200) + '...');
        } catch (altError) {
          console.log(`❌ FAILED with alternative: ${altError.message}`);
          if (altError.response) {
            console.log(`Status: ${altError.response.status}`);
            console.log(`Response data:`, altError.response.data);
          }
        }
      }
    } else {
      console.log(`❌ No chat ID found in the response`);
    }
  } catch (error) {
    console.log(`❌ FAILED to create chat: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Response data:`, error.response.data);
      
      // If /api version fails, try without /api
      if (error.response.status === 404) {
        try {
          const altEndpoint = `/chats/booking/${bookingId}/messages`;
          console.log(`\nTrying alternative endpoint: ${altEndpoint}`);
          
          const payload = {
            message: 'Hello, I am ready to start your consultation.',
            senderType: 'astrologer',
            astrologerId: astrologerId,
            senderId: astrologerId
          };
          
          const altResponse = await axios.post(`${baseUrl}${altEndpoint}`, payload, { headers });
          console.log(`✅ SUCCESS with alternative: Status ${altResponse.status}`);
          console.log(`Response data:`, JSON.stringify(altResponse.data, null, 2));
        } catch (altError) {
          console.log(`❌ FAILED with alternative: ${altError.message}`);
          if (altError.response) {
            console.log(`Status: ${altError.response.status}`);
            console.log(`Response data:`, altError.response.data);
          }
        }
      }
    }
  }
  
  console.log('\n=== Test Complete ===');
  return true;
};

// Main function
const main = async () => {
  try {
    const baseUrl = await prompt('Enter the API base URL (e.g., http://localhost:3002): ');
    const token = await prompt('Enter your JWT token: ');
    const astrologerId = await prompt('Enter your astrologer ID: ');
    const bookingId = await prompt('Enter a booking ID to test: ');
    
    if (!baseUrl || !token || !astrologerId || !bookingId) {
      console.error('All parameters are required!');
      rl.close();
      return;
    }
    
    await testChatEndpoints(baseUrl, token, astrologerId, bookingId);
    
    rl.close();
  } catch (error) {
    console.error('Unexpected error:', error);
    rl.close();
  }
};

// Run the script
main(); 