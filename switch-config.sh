#!/bin/bash

# Helper script to switch between different config files for different environments

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Jyotish Call Astrologer App - Configuration Switcher${NC}"
echo "=================================================="

# Check if the config files exist
if [ ! -f "src/config.ts" ]; then
  echo -e "${RED}Error: src/config.ts does not exist!${NC}"
  exit 1
fi

# Menu for selection
echo "Select a configuration to use:"
echo -e "  ${GREEN}1) Standard configuration${NC} (auto-selects based on platform)"
echo -e "  ${YELLOW}2) Mobile device configuration${NC} (forces connection to local network IP)"
echo -e "  ${BLUE}3) Emulator configuration${NC} (forces 10.0.2.2 for Android emulator)"
echo -e "  ${RED}4) Exit${NC}"

read -p "Enter your choice (1-4): " choice

# Backup current config
backup_file="src/config.ts.backup.$(date +%s)"
cp src/config.ts "$backup_file"
echo -e "Current config backed up to ${YELLOW}$backup_file${NC}"

case $choice in
  1)
    # Reset to standard config - just copy the existing backup
    cp src/config.ts src/config.ts
    echo -e "${GREEN}Using standard auto-detection configuration${NC}"
    ;;
  2)
    # Use mobile device specific config if it exists
    if [ -f "src/config.mobile.ts" ]; then
      cp src/config.mobile.ts src/config.ts
      echo -e "${YELLOW}Using mobile device configuration (direct IP connection)${NC}"
    else
      echo -e "${RED}Error: src/config.mobile.ts does not exist!${NC}"
      echo "Creating a mobile-specific config..."
      
      # Create mobile config from existing with LOCAL_NETWORK_API_URL as API_URL
      sed 's/export const API_URL = (() => {/export const API_URL = LOCAL_NETWORK_API_URL; \/\/ MOBILE OVERRIDE\n\/\/ Original auto-detection logic below\n\/\*\nexport const API_URL = (() => {/' src/config.ts > src/config.mobile.ts
      sed -i '' 's/})();/})();\n*\//' src/config.mobile.ts
      
      # Now use this file
      cp src/config.mobile.ts src/config.ts
      echo -e "${GREEN}Created and activated mobile-specific config!${NC}"
    fi
    ;;
  3)
    # Create and use emulator specific config
    cat > src/config.emulator.ts << EOF
import { Platform } from 'react-native';

// Define API URLs for different environments
export const LOCAL_IP = '192.168.29.231'; 
export const API_PORT = '3002';

// Define all the URLs
export const DEV_API_URL = \`http://localhost:\${API_PORT}/api\`;
export const LOCAL_NETWORK_API_URL = \`http://\${LOCAL_IP}:\${API_PORT}/api\`;
export const ANDROID_EMULATOR_URL = \`http://10.0.2.2:\${API_PORT}/api\`;
export const PROD_API_URL = 'https://your-production-api.com/api';

// OVERRIDE: Force Android emulator URL
export const API_URL = ANDROID_EMULATOR_URL;

// Log the selected API URL for debugging
console.log(\`📍 EMULATOR CONFIG: Using API URL: \${API_URL}\`);

// Rest of your config file content
export const APP_IDENTIFIER = 'astrologer-app';

// Copy the rest of your original config...
EOF
    
    # Now use this file
    cp src/config.emulator.ts src/config.ts
    echo -e "${BLUE}Created and activated emulator-specific config!${NC}"
    ;;
  4)
    echo -e "${RED}Exiting without changes${NC}"
    exit 0
    ;;
  *)
    echo -e "${RED}Invalid choice. Exiting without changes${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}Configuration updated!${NC}"
echo "Restart your app for changes to take effect:"
echo -e "${YELLOW}npx expo start --clear${NC}"
echo "" 