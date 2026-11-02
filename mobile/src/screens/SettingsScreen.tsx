import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '../../App';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../store';
import { useAuth } from '../lib/auth';
import AppHeader from '../components/AppHeader';
import type { RootStackParamList } from '../../App';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

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
      }}
    >
      <Text style={{ fontSize: size * 0.55, color: '#fff' }}>👤</Text>
    </View>
  );
}

function ProfileCard() {
  const navigation = useNavigation<Nav>();
  const { apiUrl } = useApp();
  const { user, token, authReady, logout, updateProfile, uploadAvatar } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setDisplayName(user.display_name);
      setIsPrivate(user.is_private);
    }
  }, [user]);

  if (!authReady) return null;

  if (!token || !user) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.hint}>Save events to your account and sync them across devices.</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => navigation.navigate('Auth', { mode: 'signup' })}
        >
          <Text style={styles.btnText}>Log in / Sign up</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const avatarUri = user.avatar_url ? `${apiUrl}${user.avatar_url}` : null;

  const onSaveProfile = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await updateProfile({
        username: username.trim().replace(/^@/, ''),
        display_name: displayName.trim(),
      });
      setSaveMsg('Profile saved.');
    } catch (e: any) {
      setSaveMsg(e?.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  // Private toggle applies immediately — no Save needed.
  const onTogglePrivate = async (v: boolean) => {
    setIsPrivate(v);
    try {
      await updateProfile({ is_private: v });
    } catch {
      setIsPrivate(!v);
    }
  };

  const onPickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? 'image/jpeg';
    setAvatarBusy(true);
    try {
      await uploadAvatar(`data:${mime};base64,${asset.base64}`);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not upload avatar.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const onLogout = () => {
    Alert.alert('Log out', 'Log out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.avatarRow}>
        <TouchableOpacity onPress={onPickAvatar} disabled={avatarBusy}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <DefaultAvatar size={72} />
          )}
          {avatarBusy && (
            <View style={styles.avatarBusy}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Profile', { username: user.username })}>
            <Text style={[styles.username, styles.usernameLink]}>@{user.username}</Text>
          </TouchableOpacity>
          <Text style={styles.memberSince}>
            Member since {new Date(user.created_at).toLocaleDateString()}
          </Text>
          <TouchableOpacity onPress={onPickAvatar}>
            <Text style={styles.changePhoto}>Change photo</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.fieldLabel}>Username</Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="username"
      />
      <Text style={styles.fieldLabel}>Display name</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Display name"
      />
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchTitle}>Private profile</Text>
          <Text style={styles.switchHint}>
            Only you can see your saved events. Your profile stays visible.
          </Text>
        </View>
        <Switch value={isPrivate} onValueChange={onTogglePrivate} />
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={onSaveProfile} disabled={saving}>
          <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save profile'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onLogout}>
          <Text style={[styles.btnText, styles.btnSecondaryText]}>Log out</Text>
        </TouchableOpacity>
      </View>
      {saveMsg ? <Text style={styles.result}>{saveMsg}</Text> : null}
    </View>
  );
}

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <AppHeader />
      <ScrollView style={styles.container}>
        <ProfileCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#0B1D3A', marginBottom: 8 },
  hint: { fontSize: 12, color: '#777', marginBottom: 8 },
  input: {
    backgroundColor: '#F4F5F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  row: { flexDirection: 'row', marginTop: 12 },
  btn: {
    backgroundColor: '#0B1D3A',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  btnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0B1D3A' },
  btnSecondaryText: { color: '#0B1D3A' },
  ok: { color: '#2E7D32', marginTop: 8, fontWeight: '600' },
  result: { marginTop: 8, fontSize: 13, color: '#333' },
  current: { marginTop: 8, fontSize: 12, color: '#777' },
  body: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 10 },
  version: { fontSize: 12, color: '#999', marginTop: 4 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarBusy: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: { fontSize: 16, fontWeight: '700', color: '#0B1D3A' },
  usernameLink: { textDecorationLine: 'underline' },
  memberSince: { fontSize: 12, color: '#777', marginTop: 2 },
  changePhoto: { fontSize: 13, color: '#0B1D3A', fontWeight: '600', marginTop: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#0B1D3A', marginTop: 10, marginBottom: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 4 },
  switchTitle: { fontSize: 14, fontWeight: '600', color: '#0B1D3A' },
  switchHint: { fontSize: 12, color: '#777', marginTop: 2, paddingRight: 8 },
});
