import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../store';
import { getPublicProfile, useAuth, type PublicProfile } from '../lib/auth';
import EventCard from '../components/EventCard';
import type { RootStackParamList } from '../../App';

function DefaultAvatar({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#C9CDD3',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      <Text style={{ fontSize: size * 0.55, color: '#fff' }}>👤</Text>
    </View>
  );
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = { params: { username: string } };

/** Public profile page: avatar, name, @username, member since, and saved events. */
export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute() as unknown as Route;
  const username = route.params.username;
  const { apiUrl } = useApp();
  const { token } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setNotFound(false);
    getPublicProfile(apiUrl, username, token)
      .then(setProfile)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [apiUrl, username, token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    navigation.setOptions({ title: profile ? `@${profile.username}` : 'Profile' });
  }, [navigation, profile]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (notFound || !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>User not found.</Text>
      </View>
    );
  }

  const avatarUri = profile.avatar_url ? `${apiUrl}${profile.avatar_url}` : null;
  const savesPrivate = profile.saves === 'private';
  const saves = savesPrivate ? [] : (profile.saves as any[]);

  return (
    <FlatList
      style={styles.container}
      data={saves}
      keyExtractor={(e) => String(e.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <DefaultAvatar size={72} />
          )}
          <View style={styles.headerText}>
            <Text style={styles.displayName}>{profile.display_name}</Text>
            <Text style={styles.username}>@{profile.username}</Text>
            <Text style={styles.memberSince}>
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </Text>
          </View>
          <Text style={styles.sectionTitle}>
            Saved events{savesPrivate ? '' : ` (${saves.length})`}
          </Text>
          {savesPrivate && <Text style={styles.privateText}>Event saves set to private.</Text>}
          {!savesPrivate && saves.length === 0 && (
            <Text style={styles.emptyText}>No saved events yet.</Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <EventCard
          event={item}
          onPress={() => navigation.navigate('EventDetail', { slug: item.slug, title: item.title })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { padding: 20, paddingBottom: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
  headerText: { marginBottom: 20 },
  displayName: { fontSize: 20, fontWeight: '700', color: '#0B1D3A' },
  username: { fontSize: 16, color: '#555', marginTop: 2 },
  memberSince: { fontSize: 13, color: '#888', marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0B1D3A', marginBottom: 8 },
  privateText: { fontSize: 14, color: '#888', fontStyle: 'italic' },
  emptyText: { fontSize: 14, color: '#888' },

});
