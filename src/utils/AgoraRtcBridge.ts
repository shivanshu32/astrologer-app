/**
 * AgoraRtcBridge.ts
 * 
 * This file provides a compatibility layer for Agora RTC integration with Expo
 * and handles proper initialization of the Agora SDK.
 */

import React from 'react';
import { NativeModules, Platform, View, Text } from 'react-native';

// Mock classes and types to match react-native-agora API
export class RtcEngine {
  private static instance: RtcEngine | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private channelName: string | null = null;
  private userId: number | null = null;
  private appId: string | null = null;

  private constructor(appId: string) {
    this.appId = appId;
    console.log(`[Agora] Created RtcEngine with AppID: ${appId}`);
  }

  public static async create(appId: string): Promise<RtcEngine> {
    if (!RtcEngine.instance) {
      RtcEngine.instance = new RtcEngine(appId);
      
      // In a real implementation, this would initialize the native module
      console.log('[Agora] Initializing RtcEngine...');
      
      // Check if native module exists and log appropriate message
      if (Platform.OS !== 'web') {
        try {
          const AgoraModule = NativeModules.AgoraRtcNg;
          if (!AgoraModule) {
            console.error('[Agora] Native module not found. Using mock implementation.');
          }
        } catch (error) {
          console.error('[Agora] Error accessing native module:', error);
        }
      }
    }
    
    return RtcEngine.instance;
  }

  public addListener(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    console.log(`[Agora] Added listener for event: ${event}`);
  }

  public removeListener(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  public removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  private emitEvent(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`[Agora] Error in ${event} listener:`, error);
      }
    });
  }

  public async enableVideo(): Promise<void> {
    console.log('[Agora] Video enabled');
    return Promise.resolve();
  }

  public async enableLocalVideo(enabled: boolean): Promise<void> {
    console.log(`[Agora] Local video ${enabled ? 'enabled' : 'disabled'}`);
    return Promise.resolve();
  }

  public async enableLocalAudio(enabled: boolean): Promise<void> {
    console.log(`[Agora] Local audio ${enabled ? 'enabled' : 'disabled'}`);
    return Promise.resolve();
  }

  public async joinChannel(token: string | null, channelName: string, info: string | null, uid: number): Promise<void> {
    this.channelName = channelName;
    this.userId = uid;
    console.log(`[Agora] Joining channel: ${channelName}, uid: ${uid}`);
    
    // Simulate joining a channel successfully
    setTimeout(() => {
      this.emitEvent('JoinChannelSuccess', channelName, uid, 0);
    }, 1000);
    
    return Promise.resolve();
  }

  public async leaveChannel(): Promise<void> {
    console.log(`[Agora] Leaving channel: ${this.channelName}`);
    this.channelName = null;
    return Promise.resolve();
  }

  public async setChannelProfile(profile: number): Promise<void> {
    console.log(`[Agora] Channel profile set to: ${profile}`);
    return Promise.resolve();
  }

  public async setClientRole(role: number): Promise<void> {
    console.log(`[Agora] Client role set to: ${role}`);
    return Promise.resolve();
  }

  public async switchCamera(): Promise<void> {
    console.log('[Agora] Camera switched');
    return Promise.resolve();
  }

  public async destroy(): Promise<void> {
    console.log('[Agora] Engine destroyed');
    RtcEngine.instance = null;
    return Promise.resolve();
  }
}

// Enum types to match react-native-agora
export enum ChannelProfileType {
  Communication = 0,
  LiveBroadcasting = 1,
}

export enum ClientRoleType {
  Broadcaster = 1,
  Audience = 2,
}

export enum RenderModeType {
  Hidden = 1,
  Fit = 2,
  Adaptive = 3,
}

// Mock Surface view component - to be imported in the VideoCallScreen
// Using React.createElement instead of JSX to avoid TypeScript JSX parsing issues
export const RtcSurfaceView = ({ style, uid, channelId, renderMode }: any) => {
  console.log(`[Agora] Rendering SurfaceView for ${uid || 'local'} user`);
  
  // Create styles for the container
  const containerStyle = {
    ...style,
    backgroundColor: uid ? '#4a69bd' : '#60a3bc',
    justifyContent: 'center',
    alignItems: 'center',
  };
  
  // Create a View with text labels to simulate the video view
  return React.createElement(
    View,
    { style: containerStyle },
    React.createElement(
      Text,
      { style: { color: 'white', fontWeight: 'bold' } },
      uid ? `Remote User: ${uid}` : 'Local Camera'
    ),
    React.createElement(
      Text,
      { style: { color: 'white', fontSize: 12, marginTop: 5 } },
      channelId ? `Channel: ${channelId}` : ''
    )
  );
};

export default RtcEngine; 