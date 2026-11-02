import React, { useState } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Modal,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TabIcon, { TAB_ICON_PATHS } from './TabIcon';
import { useAuth } from '../lib/auth';

/**
 * App header bar (Angelo, Oct 31, 2026) — native parity for the mobile-site
 * header: Joinaroo logo left, search + hamburger icons right, matching the
 * web header (#0e2a47). Search jumps to the Search tab. The hamburger menu
 * carries the tab destinations + My profile (the web menu's Towns /
 * Categories have no native screens; Events / Settings are their native
 * counterparts here). Rendered at the top of each main tab screen; the bar
 * absorbs the top safe-area inset itself, so screens using it must not add
 * their own top inset padding.
 */
export default function AppHeader() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  const go = (fn: () => void) => {
    close();
    fn();
  };

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <Image
          source={require('../../assets/joinaroo-logo-v2.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Search')}
            accessibilityLabel="Search events"
          >
            <TabIcon d={TAB_ICON_PATHS.search} color="#fff" size={23} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Menu"
          >
            <TabIcon d={TAB_ICON_PATHS.settings} color="#fff" size={23} />
          </TouchableOpacity>
        </View>
      </View>
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.modalRoot}>
          <TouchableWithoutFeedback onPress={close}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>
          <View style={[styles.menu, { top: insets.top + 54 }]}>
            <TouchableOpacity
              style={styles.item}
              onPress={() => go(() => navigation.navigate('Events'))}
            >
              <Text style={styles.itemText}>Events</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.item}
              onPress={() => go(() => navigation.navigate('MySaves'))}
            >
              <Text style={styles.itemText}>My Saves</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.item}
              onPress={() => go(() => navigation.navigate('Settings'))}
            >
              <Text style={styles.itemText}>Settings</Text>
            </TouchableOpacity>
            {user?.username ? (
              <TouchableOpacity
                style={styles.item}
                onPress={() =>
                  go(() =>
                    navigation.navigate('Profile', { username: user.username }),
                  )
                }
              >
                <Text style={styles.itemText}>My profile</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#0e2a47' },
  row: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  logo: { width: 126, height: 30 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRoot: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menu: {
    position: 'absolute',
    right: 12,
    minWidth: 210,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 6,
    shadowColor: '#091930',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  item: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8 },
  itemText: { fontSize: 15, fontWeight: '600', color: '#16324A' },
});
