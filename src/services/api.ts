import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// TODO: Move to environment variables
const API_URL = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to add the auth token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth APIs
export const loginWithEmail = async (email: string, password: string) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

export const loginWithOTP = async (mobileNumber: string, otp: string) => {
  const response = await api.post('/auth/verify-otp', { mobileNumber, otp });
  return response.data;
};

export const requestOTP = async (mobileNumber: string) => {
  const response = await api.post('/auth/request-otp', { mobileNumber });
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export default api; 