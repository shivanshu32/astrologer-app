const axios = require('axios');

// Get mobile number from command line
const mobileNumber = process.argv[2];

if (!mobileNumber) {
  console.error('Please provide a mobile number as a command line argument');
  console.error('Usage: node fix-astrologer-link.js 9876543210');
  process.exit(1);
}

const API_BASE_URL = 'http://localhost:5000/api/debug';

async function fixAstrologerLink() {
  try {
    console.log(`Attempting to fix link for astrologer with mobile number: ${mobileNumber}`);
    
    const response = await axios.post(`${API_BASE_URL}/fix-astrologer-link`, {
      mobileNumber
    });
    
    console.log('\nAPI Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('\nLink fixed successfully!');
      
      const { astrologer, user } = response.data.data;
      
      console.log('\nAstrologer Details:');
      console.log(`- ID: ${astrologer._id}`);
      console.log(`- Name: ${astrologer.name}`);
      console.log(`- Mobile: ${astrologer.mobile}`);
      console.log(`- User ID link: ${astrologer.userId || 'Not linked'}`);
      console.log(`- Is Active: ${astrologer.isActive}`);
      
      console.log('\nUser Details:');
      console.log(`- ID: ${user._id}`);
      console.log(`- Name: ${user.name}`);
      console.log(`- Mobile: ${user.mobileNumber}`);
      console.log(`- Role: ${user.role}`);
      
      console.log('\nActions taken:');
      console.log(response.data.message);
    } else {
      console.log('\nFailed to fix link:');
      console.log(response.data.message);
    }
  } catch (error) {
    console.error('Error fixing astrologer link:');
    if (error.response) {
      console.error('API error response:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

fixAstrologerLink(); 