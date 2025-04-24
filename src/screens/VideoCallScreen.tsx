import React, { useState, useEffect } from 'react';
import { View as RNView, Text as RNText, TouchableOpacity as RNTouchableOpacity, SafeAreaView as RNSafeAreaView, StatusBar, Alert, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { styled } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import RtcEngine, { ChannelProfileType, ClientRoleType, RtcSurfaceView, RenderModeType } from '../utils/AgoraRtcBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../config';

const View = styled(RNView);
const Text = styled(RNText);
const TouchableOpacity = styled(RNTouchableOpacity);
const SafeAreaView = styled(RNSafeAreaView);

// Agora SDK configurations
const appId = config.AGORA.APP_ID;

const VideoCallScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { bookingId, userData } = route.params as { bookingId: string; userData: any };
  
  const [engine, setEngine] = useState<RtcEngine | null>(null);
  const [joined, setJoined] = useState(false);
  const [peerIds, setPeerIds] = useState<number[]>([]);
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'ended'>('connecting');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(userData || {
    name: 'User',
  });
  
  // Timer for call duration
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (callStatus === 'connected') {
      intervalId = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [callStatus]);
  
  // Format call duration time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Request permissions and initialize Agora engine
  useEffect(() => {
    const init = async () => {
      // Request camera and microphone permissions
      if (Platform.OS === 'android') {
        await requestCameraAndAudioPermission();
      }
      
      try {
        // Initialize Agora engine
        const rtcEngine = await RtcEngine.create(appId);
        await rtcEngine.enableVideo();
        
        // Set event listeners
        rtcEngine.addListener('JoinChannelSuccess', (channel, uid, elapsed) => {
          console.log('JoinChannelSuccess', channel, uid, elapsed);
          setCallStatus('connected');
          setJoined(true);
        });
        
        rtcEngine.addListener('UserJoined', (uid, elapsed) => {
          console.log('UserJoined', uid, elapsed);
          setPeerIds(prevPeerIds => [...prevPeerIds, uid]);
        });
        
        rtcEngine.addListener('UserOffline', (uid, reason) => {
          console.log('UserOffline', uid, reason);
          setPeerIds(prevPeerIds => prevPeerIds.filter(id => id !== uid));
          
          // If peer leaves, we could end the call automatically
          if (peerIds.length === 0) {
            handleEndCall();
          }
        });
        
        rtcEngine.addListener('Error', (err) => {
          console.log('Error', err);
          Alert.alert('Error', `An error occurred: ${err}`);
        });
        
        setEngine(rtcEngine);
        
        // Join the channel with the booking ID as the channel name
        await rtcEngine.setChannelProfile(ChannelProfileType.LiveBroadcasting);
        await rtcEngine.setClientRole(ClientRoleType.Broadcaster);
        await rtcEngine.joinChannel(null, bookingId, null, 0);
      } catch (error) {
        console.error('Failed to initialize Agora engine', error);
        Alert.alert('Error', 'Failed to start video call');
      }
    };
    
    init();
    
    // Clean up on unmount
    return () => {
      if (engine) {
        engine.destroy();
      }
    };
  }, [bookingId, peerIds.length]);
  
  // Request permissions for Android
  const requestCameraAndAudioPermission = async () => {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
      
      if (
        granted[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED ||
        granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED
      ) {
        Alert.alert('Permission Error', 'Camera and microphone permissions required for video call');
        navigation.goBack();
      }
    } catch (err) {
      console.warn(err);
      Alert.alert('Permission Error', 'Failed to request permissions');
      navigation.goBack();
    }
  };
  
  // Toggle microphone
  const toggleMicrophone = async () => {
    if (engine) {
      await engine.enableLocalAudio(!isMuted);
      setIsMuted(!isMuted);
    }
  };
  
  // Toggle camera
  const toggleCamera = async () => {
    if (engine) {
      await engine.enableLocalVideo(!isCameraOff);
      setIsCameraOff(!isCameraOff);
    }
  };
  
  // Switch camera
  const switchCamera = async () => {
    if (engine) {
      await engine.switchCamera();
    }
  };
  
  // End call
  const handleEndCall = async () => {
    if (engine) {
      await engine.leaveChannel();
    }
    
    setCallStatus('ended');
    
    // Update consultation status in the backend (to be implemented)
    try {
      // API call to update consultation status
      // await consultationService.endConsultation(bookingId);
      
      // For now, just log
      console.log('Call ended, bookingId:', bookingId, 'duration:', callDuration);
      
      // Show alert with call details
      Alert.alert(
        'Call Ended',
        `Your call with ${userInfo.name || 'User'} lasted ${formatTime(callDuration)}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      
    } catch (error) {
      console.error('Error ending consultation:', error);
      Alert.alert('Error', 'Failed to update consultation status');
      navigation.goBack();
    }
  };
  
  // Render remote user videos
  const renderRemoteUsers = () => {
    return peerIds.map(uid => (
      <RtcSurfaceView
        key={uid}
        uid={uid}
        style={styles.fullView}
        channelId={bookingId}
        renderMode={RenderModeType.Hidden}
      />
    ));
  };
  
  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <StatusBar barStyle="light-content" />
      
      {/* Call Status and Duration */}
      <View className="absolute top-8 left-0 right-0 z-10 items-center">
        <Text className="text-white text-xl font-semibold mb-2">
          {userInfo?.name || 'User'}
        </Text>
        <Text className="text-gray-300">
          {callStatus === 'connecting' ? 'Connecting...' : 
           callStatus === 'connected' ? formatTime(callDuration) : 
           'Call ended'}
        </Text>
      </View>
      
      {/* Video Views */}
      <View style={styles.fullView}>
        {/* Main Video - Remote User */}
        {peerIds.length > 0 ? (
          renderRemoteUsers()
        ) : (
          <View className="flex-1 items-center justify-center bg-gray-800">
            {callStatus === 'connecting' ? (
              <View className="items-center">
                <Text className="text-white mb-4">Waiting for user to join...</Text>
                <Text className="text-gray-400">Booking ID: {bookingId}</Text>
              </View>
            ) : (
              <Text className="text-white">No one is connected</Text>
            )}
          </View>
        )}
        
        {/* Local User - Small Picture-in-Picture */}
        {!isCameraOff && joined && (
          <View style={styles.pipView}>
            <RtcSurfaceView
              style={styles.fullView}
              channelId={bookingId}
              renderMode={RenderModeType.Hidden}
            />
          </View>
        )}
      </View>
      
      {/* Call Controls */}
      <View className="flex-row justify-center items-center p-8 space-x-6">
        <TouchableOpacity className="items-center" onPress={toggleMicrophone}>
          <View className={`w-12 h-12 rounded-full items-center justify-center mb-2 ${isMuted ? 'bg-red-500' : 'bg-gray-700'}`}>
            <Ionicons name={isMuted ? "mic-off" : "mic"} size={24} color="white" />
          </View>
          <Text className="text-gray-300 text-xs">{isMuted ? "Unmute" : "Mute"}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity className="items-center" onPress={toggleCamera}>
          <View className={`w-12 h-12 rounded-full items-center justify-center mb-2 ${isCameraOff ? 'bg-red-500' : 'bg-gray-700'}`}>
            <Ionicons name={isCameraOff ? "videocam-off" : "videocam"} size={24} color="white" />
          </View>
          <Text className="text-gray-300 text-xs">{isCameraOff ? "Camera On" : "Camera Off"}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity className="items-center" onPress={handleEndCall}>
          <View className="bg-red-500 w-16 h-16 rounded-full items-center justify-center mb-2">
            <Ionicons name="call" size={32} color="white" />
          </View>
          <Text className="text-gray-300 text-xs">End</Text>
        </TouchableOpacity>
        
        <TouchableOpacity className="items-center" onPress={switchCamera}>
          <View className="bg-gray-700 w-12 h-12 rounded-full items-center justify-center mb-2">
            <Ionicons name="camera-reverse" size={24} color="white" />
          </View>
          <Text className="text-gray-300 text-xs">Switch</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fullView: {
    flex: 1,
    width: '100%',
  },
  pipView: {
    position: 'absolute',
    width: 120,
    height: 160,
    right: 16,
    top: 100,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});

export default VideoCallScreen; 