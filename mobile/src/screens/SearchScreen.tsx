import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getEvents } from '../api';
import type { EventItem } from '../types';
import { useApp } from '../store';
import EventCard from '../components/EventCard';
import AppHeader from '../components/AppHeader';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SearchScreen() {
  const navigation = useNavigation<Nav>();
  const { apiUrl, apiUrlReady, location } = useApp();

  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [results, setResults] = useState<EventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (text: string, cityText: string) => {
      if (!apiUrlReady) return;
      const query = text.trim();
      const cityQ = cityText.trim();
      if (!query && !cityQ) {
        setResults([]);
        setTotal(0);
        setSearched(false);
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const res = await getEvents(apiUrl, {
          q: query || undefined,
          city: cityQ || undefined,
          lat: location?.lat,
          lng: location?.lng,
          radius_km: 120,
          limit: 50,
        });
        setResults(res.events);
        setTotal(res.total);
        setSearched(true);
      } catch (e: any) {
        setError(e?.message ?? 'Search failed.');
      } finally {
        setSearching(false);
      }
    },
    [apiUrl, apiUrlReady, location],
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => doSearch(q, city), 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, city, doSearch]);

  return (
    <View style={styles.container}>
      <AppHeader />
      <View style={styles.searchBox}>
        <TextInput
          style={styles.input}
          placeholder="Search events by name…"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          placeholder="City (e.g. Portland)"
          value={city}
          onChangeText={setCity}
          autoCapitalize="words"
          returnKeyType="search"
        />
      </View>
      {searching ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => doSearch(q, city)}>
            <Text style={styles.btnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.slug}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onPress={() => navigation.navigate('EventDetail', { slug: item.slug, title: item.title })}
            />
          )}
          ListHeaderComponent={
            searched ? (
              <Text style={styles.count}>
                {total} result{total === 1 ? '' : 's'}
                {location ? ' (nearest first)' : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.hint}>
                {searched
                  ? 'No events match. Try different keywords or clear the city filter.'
                  : 'Type to search event names and descriptions.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  searchBox: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  input: {
    backgroundColor: '#F4F5F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { color: '#777', textAlign: 'center' },
  errorText: { color: '#B00020', textAlign: 'center', marginBottom: 12 },
  btn: { backgroundColor: '#0B1D3A', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
  count: { margin: 12, marginBottom: 4, fontSize: 13, color: '#555', fontWeight: '600' },
});
