import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/store';
import { AuthProvider, useAuth, HAS_LOGGED_IN_KEY } from './src/lib/auth';
import EventsScreen from './src/screens/EventsScreen';
import MySavesScreen from './src/screens/MySavesScreen';
import SearchScreen from './src/screens/SearchScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import EventDetailScreen from './src/screens/EventDetailScreen';
import AuthScreen from './src/screens/AuthScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TabIcon, { TAB_ICON_PATHS } from './src/components/TabIcon';

export type RootStackParamList = {
  Main: undefined;
  EventDetail: { slug: string; title?: string; scrollToPhotos?: boolean; scrollToHero?: boolean };
  Auth: { mode?: 'login' | 'signup'; pendingEventId?: number; isRoot?: boolean } | undefined;
};

export type TabParamList = {
  Events: undefined;
  MySaves: undefined;
  Search: undefined;
  Settings: undefined;
  Profile: { username: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="Events"
        component={EventsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <TabIcon d={TAB_ICON_PATHS.events} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="MySaves"
        component={MySavesScreen}
        options={{
          tabBarLabel: 'My Saves',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>★</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <TabIcon d={TAB_ICON_PATHS.search} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <TabIcon d={TAB_ICON_PATHS.settings} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarItemStyle: { display: 'none' } }}
      />
    </Tab.Navigator>
  );
}

/**
 * Auth gate: if the user isn't logged in, the Auth screen is the first
 * thing they see. Returning users (logged in before) get the login form;
 * first-timers get signup.
 */
function AuthGate() {
  const { token, authReady } = useAuth();
  const [hasLoggedInBefore, setHasLoggedInBefore] = useState<boolean | null>(null);
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const prevToken = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(HAS_LOGGED_IN_KEY).then((v) => setHasLoggedInBefore(v === '1'));
  }, []);

  // If the session drops while the app is running (logout, token revoked),
  // send the user back to the Auth screen.
  useEffect(() => {
    if (!authReady) return;
    if (prevToken.current && !token) {
      navRef.current?.reset({
        index: 0,
        routes: [{ name: 'Auth', params: { mode: 'login', isRoot: true } }],
      });
    }
    prevToken.current = token;
  }, [token, authReady]);

  if (!authReady || hasLoggedInBefore === null) return null;

  const loggedIn = !!token;
  const initialRoute = loggedIn ? 'Main' : 'Auth';
  const authParams = loggedIn
    ? undefined
    : { mode: hasLoggedInBefore ? ('login' as const) : ('signup' as const), isRoot: true };

  return (
    <NavigationContainer ref={navRef}>
      <StatusBar style="auto" />
      <Stack.Navigator initialRouteName={initialRoute}>
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />


        <Stack.Screen
          name="EventDetail"
          component={EventDetailScreen}
          options={({ route }) => ({ title: route.params.title ?? 'Event details' })}
        />
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          initialParams={authParams}
          options={{
            headerShown: false,
            // When Auth is the root (logged-out launch), it's a full screen.
            // When pushed as a modal (star tap while logged out), it's transparent.
            presentation: 'transparentModal',
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'fade',
          }}
        />

      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AppInner() {
  const { apiUrl, apiUrlReady } = useApp();
  if (!apiUrlReady) return null;
  return (
    <AuthProvider apiUrl={apiUrl}>
      <AuthGate />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
