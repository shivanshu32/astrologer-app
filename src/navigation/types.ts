import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  OTP: { mobileNumber: string; generatedOtp: string };
};

export type MainStackParamList = {
  Home: undefined;
  Profile: undefined;
  Consultations: undefined;
  Earnings: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
}; 