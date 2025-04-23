import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  OTP: { mobileNumber: string; generatedOtp: string };
};

export type TabNavigatorParamList = {
  HomeTab: undefined;
  BookingRequestsTab: undefined;
  ProfileTab: undefined;
};

export type MainStackParamList = {
  TabHome: undefined;
  Home: undefined;
  Profile: undefined;
  Consultations: undefined;
  Earnings: undefined;
  Settings: undefined;
  BookingRequests: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
}; 