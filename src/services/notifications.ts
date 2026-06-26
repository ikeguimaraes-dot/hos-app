import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications só funcionam em dispositivo físico');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permissão de notificação negada');
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    '2025d843-bc23-4383-844b-6c073086d5af';

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'KPH HOS',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C4622D',
    });
  }

  return token;
}

export type NotificationType =
  | 'ponto_nao_batido'
  | 'aprovacao_pendente'
  | 'ajuste_resolvido'
  | 'campanha_nova';
