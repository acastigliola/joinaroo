import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { EventItem } from '../types';
import { useApp } from '../store';
import { useAuth, fetchServerSaves, serverUnsave } from '../lib/auth';
import EventCard from '../components/EventCard';
import AppHeader from '../components/AppHeader';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function MySavesScreen() {
  const navigation = useNavigation<Nav>();
  const { apiUrl, apiUrlReady } = useApp();
  const { token, authReady } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setEvents([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const r = await fetchServerSaves(apiUrl, token);
      const now = Date.now();
      const items = (r.saves as EventItem[])
        .filter((e) => new Date(e.starts_at).getTime() >= now - 1000 * 60 * 60 * 12)
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
      setEvents(items);
    } catch {
      setEvents([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [apiUrl, token]);

  useFocusEffect(
    useCallback(() => {
      if (apiUrlReady && authReady) {
        setLoading(true);
        load();
      }
    }, [apiUrlReady, authReady, load]),
  );

  const openDetail = (slug: string, title: string) =>
    navigation.navigate('EventDetail', { slug, title });

  const toggleSave = useCallback(
    async (event: EventItem) => {
      if (!token) return;
      await serverUnsave(apiUrl, token, Number(event.id));
      load();
    },
    [apiUrl, token, load],
  );

  const goAuth = () => navigation.navigate('Auth', { mode: 'signup' });

  return (
    <View style={styles.container}>
      <AppHeader />
      <Text style={styles.header}>My Saves</Text>
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : !token ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Sign up to save events and sync them to your account.</Text>
          <TouchableOpacity style={styles.authBtn} onPress={goAuth}>
            <Text style={styles.authBtnText}>Log in / Sign up</Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>
            Nothing saved yet. Tap the ☆ on any event to save it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => String(e.id)}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onPress={() => openDetail(item.slug, item.title)}
              saved
              onToggleSave={() => toggleSave(item)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  header: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0B1D3A',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  authBtn: {
    marginTop: 16,
    backgroundColor: '#0B1D3A',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  authBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
