const axios = require('axios');

// Get mobile number from command line
const mobileNumber = process.argv[2];

if (!mobileNumber) {
  console.error('Please provide a mobile number as a command line argument');
  console.error('Usage: node test-lookup.js 9876543210');
  process.exit(1);
}

const API_BASE_URL = 'http://localhost:5000/api/debug';

async function lookupAstrologer() {
  try {
    console.log(`Looking up astrologer with mobile number: ${mobileNumber}`);
    const response = await axios.get(`${API_BASE_URL}/lookup-astrologer/${mobileNumber}`);
    
    console.log('\nAPI Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('\nAstrologer found!');
      
      const { astrologer, userData, bookingCount } = response.data;
      
      console.log('\nAstrologer Details:');
      console.log(`- ID: ${astrologer._id}`);
      console.log(`- Name: ${astrologer.name}`);
      console.log(`- Mobile: ${astrologer.mobile}`);
      console.log(`- User ID link: ${astrologer.userId || 'Not linked'}`);
      console.log(`- Is Active: ${astrologer.isActive}`);
      console.log(`- Booking Count: ${bookingCount}`);
      
      if (userData) {
        console.log('\nLinked User Details:');
        console.log(`- ID: ${userData._id}`);
        console.log(`- Name: ${userData.name}`);
        console.log(`- Mobile: ${userData.mobileNumber}`);
        console.log(`- User Type: ${userData.userType}`);
      } else {
        console.log('\nNo linked user found!');
      }
    } else {
      console.log('\nAstrologer not found!');
      if (response.data.userData) {
        console.log('\nBut a user with this mobile number exists:');
        console.log(`- ID: ${response.data.userData._id}`);
        console.log(`- Name: ${response.data.userData.name}`);
        console.log(`- Mobile: ${response.data.userData.mobileNumber}`);
        console.log(`- User Type: ${response.data.userData.userType}`);
        console.log(`- Is Astrologer: ${response.data.userData.isAstrologer}`);
      } else {
        console.log('No user found with this mobile number either.');
      }
    }
  } catch (error) {
    console.error('Error looking up astrologer:');
    if (error.response) {
      console.error('API error response:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

lookupAstrologer(); 