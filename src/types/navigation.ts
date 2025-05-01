import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Home: undefined;
  Chat: { chatId: string; bookingId?: string };
  Chats: undefined;
  Profile: undefined;
  Settings: undefined;
  Bookings: undefined;
  Consultations: undefined;
  VideoCall: { bookingId: string };
  Call: { bookingId: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
} 