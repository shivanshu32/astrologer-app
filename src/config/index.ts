// App configuration
const config = {
  // API settings
  API_URL: 'https://api.yourserver.com', // Replace with your actual API URL
  
  // Agora settings
  AGORA: {
    APP_ID: '25b98d94bee34f4eaac05a5e46a733ba', // Use the default ID from your agora.routes.js file
    APP_CERTIFICATE: '' // Leave blank for now
  },
  
  // General app settings
  APP_NAME: 'Jyotish Call - Astrologer',
  VERSION: '1.0.0',
  
  // Feature flags
  FEATURES: {
    VIDEO_CALL_ENABLED: true,
    AUDIO_CALL_ENABLED: true,
    CHAT_ENABLED: true,
  },
  
  // Astrologer app specific settings
  AVAILABILITY: {
    DEFAULT_STATUS: 'online',
    IDLE_TIMEOUT_MINUTES: 15, // Auto status change to away after inactivity
  },
};

export default config; 