/**
 * Test script to verify whether chats are being fetched from the chats collection instead of chatrooms
 * 
 * Run with: node test-chat-collection.js
 */

const axios = require('axios');
const readline = require('readline');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility function for prompting
const prompt = (query) => new Promise((resolve) => rl.question(query, resolve));

// Main test function
async function testChatCollections() {
  console.log('\n=== TEST: ENSURE CHATS ARE FETCHED FROM CHATS COLLECTION ===\n');
  
  try {
    // Collect test information
    const apiUrl = await prompt('Enter API URL (e.g., http://localhost:3002/api): ');
    const token = await prompt('Enter your astrologer auth token: ');
    const astrologerId = await prompt('Enter your astrologer ID: ');
    
    // Set common headers
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-App-Identifier': 'astrologer-app',
      'X-Astrologer-ID': astrologerId
    };
    
    // Create API instance
    const api = axios.create({
      baseURL: apiUrl,
      headers
    });
    
    console.log('\n1. Testing endpoints that should query the chats collection...');
    
    // Test endpoints one by one
    const endpoints = [
      '/chats/astrologer',
      `/chats?astrologerId=${astrologerId}`,
      '/chats?role=astrologer',
      '/bookings/astrologer/chats',
      '/api/chats/astrologer'
    ];
    
    for (const endpoint of endpoints) {
      console.log(`\nTrying endpoint: ${endpoint}`);
      try {
        const response = await api.get(endpoint);
        
        if (response.data && response.data.success) {
          const chats = response.data.data || [];
          console.log(`✅ SUCCESS: Retrieved ${Array.isArray(chats) ? chats.length : 0} chats from endpoint`);
          
          // If we got chats, examine the first one to verify collection
          if (Array.isArray(chats) && chats.length > 0) {
            console.log(`First chat details:`, {
              _id: chats[0]._id,
              hasBookingField: !!chats[0].booking,
              hasUserField: !!chats[0].user,
              messageCount: chats[0].messages?.length || 0
            });
            
            // If it has a booking field, it's likely from the chats collection (not chatrooms)
            if (chats[0].booking) {
              console.log('✅ Verified: This chat appears to be from the chats collection (has booking field)');
            } else {
              console.log('⚠️ Warning: This chat might not be from the chats collection (missing booking field)');
            }
            
            // First working endpoint found, no need to continue
            break;
          }
        } else {
          console.log(`❌ Endpoint returned success: false or invalid data format`);
        }
      } catch (error) {
        console.log(`❌ Error with endpoint: ${error.response?.status || error.message}`);
        if (error.response?.data) {
          console.log(`Error details: ${JSON.stringify(error.response.data)}`);
        }
      }
    }
    
    // For comparison, test old endpoints that might use chatrooms collection
    console.log('\n2. Testing old endpoints that might use the chatrooms collection for comparison...');
    
    const oldEndpoints = [
      '/chat/astrologer',
      '/chat/rooms',
      '/chatrooms/astrologer',
      '/chats?type=astrologer'
    ];
    
    for (const endpoint of oldEndpoints) {
      console.log(`\nTrying old endpoint: ${endpoint}`);
      try {
        const response = await api.get(endpoint);
        
        if (response.data && response.data.success) {
          const chats = response.data.data || [];
          console.log(`Response received: ${Array.isArray(chats) ? chats.length : 0} items`);
          
          // If we got chats, examine the first one to determine collection
          if (Array.isArray(chats) && chats.length > 0) {
            // Check for characteristic fields of chatrooms collection
            const isChatroom = !chats[0].booking && !chats[0].user;
            console.log(`First item details:`, {
              _id: chats[0]._id,
              hasBookingField: !!chats[0].booking,
              hasUserField: !!chats[0].user,
              isChatroom
            });
            
            if (isChatroom) {
              console.log('⚠️ Warning: This endpoint appears to return data from the chatrooms collection');
            }
          }
        } else {
          console.log(`Endpoint returned success: false or invalid data format`);
        }
      } catch (error) {
        console.log(`Error with endpoint: ${error.response?.status || error.message}`);
      }
    }
    
    console.log('\n=== TEST COMPLETED ===');
    console.log('Recommendation: Use endpoints that return data with booking and user fields');
    console.log('These are likely from the chats collection, which appears to be the correct one.');
  } catch (error) {
    console.error('Unexpected error during test:', error);
  } finally {
    rl.close();
  }
}

// Run the test
testChatCollections(); 