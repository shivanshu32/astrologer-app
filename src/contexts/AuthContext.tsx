import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AuthContextType = {
  isAuthenticated: boolean;
  token: string | null;
  user: any | null;
  login: (token: string, userData: any) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  clearStorage: () => Promise<void>;
  debugToken: () => Promise<any>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Function to decode JWT token
const decodeJwt = (token: string): any => {
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('token');
      const storedUser = await AsyncStorage.getItem('user');

      console.log('Loaded stored token:', storedToken ? `${storedToken.substring(0, 10)}...` : 'null');
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Error loading auth data:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (newToken: string, userData: any) => {
    try {
      console.log('Storing token:', newToken ? `${newToken.substring(0, 10)}...` : 'null');
      console.log('User data:', userData);
      
      if (!newToken || newToken.trim() === '') {
        console.error('Attempting to store empty token');
        throw new Error('Invalid token received');
      }
      
      // Debug token content
      const decodedToken = decodeJwt(newToken);
      console.log('Decoded JWT token payload:', decodedToken);
      if (!decodedToken.userType || decodedToken.userType !== 'astrologer') {
        console.warn('⚠️ Warning: JWT token does not have userType "astrologer"');
        console.log('This may cause issues with socket connections');
      }
      
      console.log('Setting async storage with token and user data...');
      await AsyncStorage.setItem('token', newToken);
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      
      console.log('Setting state variables...');
      setToken(newToken);
      setUser(userData);
      setIsAuthenticated(true);
      console.log('Authentication state updated, isAuthenticated =', true);
    } catch (error) {
      console.error('Error storing auth data:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Clear auth data
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      
      // Update state
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      
      console.log('Auth data cleared during logout');
    } catch (error) {
      console.error('Error removing auth data:', error);
      throw error;
    }
  };
  
  const clearStorage = async () => {
    try {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      
      console.log('AsyncStorage items removed');
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Error clearing AsyncStorage:', error);
    }
  };
  
  // Debug function to inspect token and see if it contains the necessary fields
  const debugToken = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('token');
      if (!storedToken) {
        console.log('No token found in storage');
        return null;
      }
      
      const decoded = decodeJwt(storedToken);
      console.log('Current JWT token payload:', decoded);
      return decoded;
    } catch (error) {
      console.error('Error debugging token:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        token,
        user,
        login,
        logout,
        loading,
        clearStorage,
        debugToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 