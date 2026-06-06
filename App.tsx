import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, Fraunces_700Bold, Fraunces_700Bold_Italic } from '@expo-google-fonts/fraunces';
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from './src/screens/LoginScreen';
import PrimeiroAcessoScreen from './src/screens/PrimeiroAcessoScreen';
import HomeScreen from './src/screens/HomeScreen';
import FinanceiroScreen from './src/screens/FinanceiroScreen';
import DocumentosScreen from './src/screens/DocumentosScreen';
import RegistroScreen from './src/screens/RegistroScreen';
import FeriasScreen from './src/screens/FeriasScreen';
import CampanhasScreen from './src/screens/CampanhasScreen';
import DesenvolvimentoScreen from './src/screens/DesenvolvimentoScreen';
import ClimaScreen from './src/screens/ClimaScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { RADIUS } from './src/lib/types';
import CandidateLoginScreen from './src/screens/CandidateLoginScreen';
import InterviewScreen from './src/screens/InterviewScreen';
import InterviewCompleteScreen from './src/screens/InterviewCompleteScreen';
import { getSession } from './src/lib/auth';
import PdfViewerScreen from './src/screens/PdfViewerScreen';
import { COLORS } from './src/lib/types';

const ONBOARDING_KEY = '@hos_onboarding_done';

const Stack = createStackNavigator();
const DocumentosStack = createStackNavigator();
const Tab = createBottomTabNavigator();

function DocumentosNavigator() {
  return (
    <DocumentosStack.Navigator screenOptions={{ headerShown: false }}>
      <DocumentosStack.Screen name="DocumentosList" component={DocumentosScreen} />
      <DocumentosStack.Screen
        name="PdfViewer"
        component={PdfViewerScreen}
        options={{
          headerShown: true,
          title: 'Documento',
          headerStyle: { backgroundColor: COLORS.BACKGROUND },
          headerTintColor: COLORS.TEXT,
          headerShadowVisible: false,
        }}
      />
    </DocumentosStack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.CARD },
        headerTintColor: COLORS.TEXT,
        headerTitleStyle: { fontFamily: 'InstrumentSans_600SemiBold', fontWeight: '600' },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray500,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 28,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Financeiro"
        component={FinanceiroScreen}
        options={{
          title: 'Financeiro',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Registro"
        component={RegistroScreen}
        options={{
          title: 'Ponto',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Documentos"
        component={DocumentosNavigator}
        options={{
          title: 'Documentos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Ferias"
        component={FeriasScreen}
        options={{
          title: 'Férias',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sunny-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Desenvolvimento"
        component={DesenvolvimentoScreen}
        options={{
          title: 'Dev.',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Clima"
        component={ClimaScreen}
        options={{
          title: 'Clima',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="happy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Campanhas"
        component={CampanhasScreen}
        options={{
          title: 'Campanhas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<string>('Login');

  const [fontsLoaded] = useFonts({
    Fraunces_700Bold,
    Fraunces_700Bold_Italic,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  });

  useEffect(() => {
    (async () => {
      const [session, onboardingDone] = await Promise.all([
        getSession(),
        AsyncStorage.getItem(ONBOARDING_KEY),
      ]);

      if (!onboardingDone) {
        setInitialRoute('Onboarding');
      } else if (session) {
        setInitialRoute('AppTabs');
      } else {
        setInitialRoute('Login');
      }
      setIsReady(true);
    })();
  }, []);

  if (!isReady || !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.CARVAO }}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="PrimeiroAcesso"
            component={PrimeiroAcessoScreen}
            options={{
              headerShown: true,
              title: 'Primeiro Acesso',
              headerStyle: { backgroundColor: COLORS.BACKGROUND },
              headerTintColor: COLORS.TEXT,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen name="AppTabs" component={AppTabs} />
          <Stack.Screen name="CandidateLogin" component={CandidateLoginScreen} />
          <Stack.Screen
            name="Interview"
            component={InterviewScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="InterviewComplete"
            component={InterviewCompleteScreen}
            options={{ gestureEnabled: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
