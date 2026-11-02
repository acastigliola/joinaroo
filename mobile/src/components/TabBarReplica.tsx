import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TabIcon, { TAB_ICON_PATHS } from './TabIcon';

/**
 * Visual replica of the MainTabs bottom bar, for root-stack screens that
 * cover the tab navigator (e.g. EventDetail). Matches MainTabs' icons,
 * labels and order. Tab presses navigate back to Main with that tab
 * selected. Uses the tab navigator's default tint colors.
 */
const ACTIVE = 'rgb(0, 122, 255)';
const INACTIVE = '#8E8E93';

const TABS = [
  { screen: 'Events', label: 'Events', icon: TAB_ICON_PATHS.events },
  { screen: 'MySaves', label: 'My Saves', icon: null },
  { screen: 'Search', label: 'Search', icon: TAB_ICON_PATHS.search },
  { screen: 'Settings', label: 'Settings', icon: TAB_ICON_PATHS.settings },
] as const;

export default function TabBarReplica({
  navigation,
  active = 'Events',
}: {
  navigation: any;
  active?: string;
}) {
  const go = (screen: string) => {
    // EventDetail lives on the root stack above Main; this pops back to
    // the tab navigator and selects the requested tab there.
    navigation.navigate('Main', { screen });
  };
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const color = t.screen === active ? ACTIVE : INACTIVE;
        return (
          <TouchableOpacity
            key={t.screen}
            style={styles.tab}
            onPress={() => go(t.screen)}
            accessibilityRole="button"
            accessibilityLabel={t.label}
          >
            {t.icon ? (
              <TabIcon d={t.icon} color={color} size={24} />
            ) : (
              <Text style={{ color, fontSize: 24 }}>★</Text>
            )}
            <Text style={[styles.label, { color }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C8C7CC',
    paddingTop: 6,
    paddingBottom: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10, fontWeight: '500' },
});
