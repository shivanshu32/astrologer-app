// Test script to verify context dependencies
const fs = require('fs');
const path = require('path');

console.log('Starting context dependency test...');

try {
  // Try to read both context files
  const authContextPath = path.join(__dirname, 'src/contexts/AuthContext.tsx');
  const bookingContextPath = path.join(__dirname, 'src/contexts/BookingNotificationContext.tsx');
  
  console.log('Reading AuthContext.tsx...');
  const authContent = fs.readFileSync(authContextPath, 'utf8');
  console.log('Successfully read AuthContext.tsx');
  
  console.log('Reading BookingNotificationContext.tsx...');
  const bookingContent = fs.readFileSync(bookingContextPath, 'utf8');
  console.log('Successfully read BookingNotificationContext.tsx');
  
  // Check imports in AuthContext
  const authImportsBooking = authContent.includes("from './BookingNotificationContext'");
  console.log(`AuthContext imports BookingNotificationContext: ${authImportsBooking}`);
  
  // Check imports in BookingNotificationContext
  const bookingImportsAuth = bookingContent.includes("from './AuthContext'");
  console.log(`BookingNotificationContext imports AuthContext: ${bookingImportsAuth}`);
  
  if (authImportsBooking && bookingImportsAuth) {
    console.log('ERROR: Circular dependency detected between contexts!');
  } else {
    console.log('No circular dependency detected between contexts.');
  }
  
  console.log('Test completed successfully.');
} catch (error) {
  console.error('Test failed with error:', error);
} 