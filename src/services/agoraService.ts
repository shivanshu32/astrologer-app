import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../config';

// Define the config type required for Agora
export interface AgoraConfig {
  appId: string;
  appCertificate?: string;
  channelName: string;
  uid?: number;
}

class AgoraService {
  // Get Agora token from your backend API
  async getToken(channelName: string, uid: number = 0): Promise<string | null> {
    try {
      // This would typically call your backend to get a token
      // For testing, we'll return null, which works for testing but isn't secure for production
      
      // Example of how to call your backend:
      // const response = await axios.get(
      //   `${config.API_URL}/agora/token?channelName=${channelName}&uid=${uid}`
      // );
      // return response.data.token;
      
      console.log(`Getting token for channel: ${channelName}, uid: ${uid}`);
      return null; // For testing without a token server
    } catch (error) {
      console.error('Error getting Agora token:', error);
      return null;
    }
  }

  // Join channel with appropriate settings for a video call
  async joinVideoChannel(engine: any, channelName: string, token: string | null, uid: number = 0) {
    if (!engine) return;
    
    try {
      // Set appropriate video encoding configuration
      await engine.setVideoEncoderConfiguration({
        dimensions: {
          width: 640,
          height: 360,
        },
        frameRate: 15,
        bitrate: 600,
      });
      
      // Join the channel
      await engine.joinChannel(token, channelName, null, uid);
      
      console.log(`Joined channel: ${channelName} with uid: ${uid}`);
      return true;
    } catch (error) {
      console.error('Error joining video channel:', error);
      return false;
    }
  }

  // Leave the channel
  async leaveChannel(engine: any) {
    if (!engine) return;
    
    try {
      await engine.leaveChannel();
      console.log('Left channel');
      return true;
    } catch (error) {
      console.error('Error leaving channel:', error);
      return false;
    }
  }

  // Save call logs for analytics or history
  async saveCallLog(data: {
    channelName: string;
    duration: number;
    callType: 'video' | 'audio';
    astrologerId: string;
    userId: string;
    status: 'completed' | 'missed' | 'failed';
  }) {
    try {
      // In a real app, this would send data to your backend
      // await axios.post(`${config.API_URL}/consultations/log`, data);
      
      // For now, just log it
      console.log('Call log:', data);
      
      return true;
    } catch (error) {
      console.error('Error saving call log:', error);
      return false;
    }
  }

  // Update astrologer availability status
  async updateAvailabilityStatus(status: 'online' | 'busy' | 'offline') {
    try {
      // Get astrologer ID from local storage
      const astrologerId = await AsyncStorage.getItem('astrologerId');
      
      if (!astrologerId) {
        console.error('Astrologer ID not found');
        return false;
      }
      
      // In a real app, this would send data to your backend
      // await axios.put(`${config.API_URL}/astrologers/${astrologerId}/status`, { status });
      
      // For now, just log it
      console.log(`Updated availability status to: ${status}`);
      
      return true;
    } catch (error) {
      console.error('Error updating availability status:', error);
      return false;
    }
  }
}

export const agoraService = new AgoraService(); 