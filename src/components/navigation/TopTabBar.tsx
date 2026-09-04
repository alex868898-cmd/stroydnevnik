import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { COLORS } from '../../lib/constants';

const tabs = [
  { label: 'Журнал', route: '/(tabs)' as const, match: '/(tabs)' },
  { label: 'Проєкти', route: '/(tabs)/projects' as const, match: '/projects' },
  { label: 'Звіти', route: '/(tabs)/reports' as const, match: '/reports' },
];

export function TopTabBar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {tabs.map(tab => {
        const active = tab.match === '/(tabs)'
          ? pathname === '/' || pathname === '/(tabs)' || pathname.endsWith('/index')
          : pathname.endsWith(tab.match);

        return (
          <TouchableOpacity
            key={tab.label}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => router.replace(tab.route)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 42,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 3,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.card,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  labelActive: {
    color: '#fff',
  },
});
