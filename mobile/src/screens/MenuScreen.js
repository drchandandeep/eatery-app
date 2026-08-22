// screens/MenuScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';
import MenuItemCard from '../components/MenuItemCard';
import { useCart } from '../context/CartContext';

export default function MenuScreen({ navigation }) {
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [closedInfo, setClosedInfo] = useState(null); // { message, hours } | null when open
  const { itemCount } = useCart();

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getMenu();
      setCategories(data.categories);
      if (!activeCategory && data.categories.length) setActiveCategory(data.categories[0].id);
      setClosedInfo(
        data.store_open === false
          ? { message: data.store_closed_message, hours: data.store_hours }
          : null
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    load();
  }, []);

  const activeItems = categories.find((c) => c.id === activeCategory)?.items || [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={type.h2}>Couldn't load the menu</Text>
        <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: spacing(2) }]}>
          {error}. Check that the backend server is running at the configured BASE_URL.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={type.display}>Kahumbo</Text>
        <Pressable onPress={() => navigation.navigate('Cart')} style={styles.cartBtn}>
          <Text style={styles.cartBtnText}>Cart{itemCount > 0 ? ` (${itemCount})` : ''}</Text>
        </Pressable>
      </View>

      <View style={styles.tabsWrap}>
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(c) => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setActiveCategory(item.id)}
              style={[styles.tab, activeCategory === item.id && styles.tabActive]}
            >
              <Text
                style={[styles.tabText, activeCategory === item.id && styles.tabTextActive]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {closedInfo && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedBannerTitle}>Store closed</Text>
          <Text style={styles.closedBannerText}>
            {closedInfo.message}
            {closedInfo.hours ? ` Open ${closedInfo.hours.opens_at}\u2013${closedInfo.hours.closes_at}.` : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={activeItems}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <MenuItemCard item={item} onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })} />
        )}
        ListEmptyComponent={<Text style={type.bodyMuted}>Nothing here yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing(6) },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing(5),
    paddingTop: spacing(14),
    paddingBottom: spacing(3),
  },
  cartBtn: { backgroundColor: colors.accent, paddingHorizontal: spacing(4), paddingVertical: spacing(2.5), borderRadius: radius.pill },
  cartBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  tabsWrap: { paddingBottom: spacing(3) },
  tabsRow: { paddingHorizontal: spacing(5), paddingRight: spacing(10), gap: spacing(2), alignItems: 'center' },
  tab: {
    flexShrink: 0,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing(2),
    minHeight: 40,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.textMuted, fontWeight: '600', fontSize: 13, lineHeight: 16 },
  tabTextActive: { color: colors.white },
  closedBanner: {
    marginHorizontal: spacing(5),
    marginBottom: spacing(3),
    padding: spacing(4),
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closedBannerTitle: { fontWeight: '700', fontSize: 14, color: colors.text, marginBottom: spacing(1) },
  closedBannerText: { fontSize: 13, color: colors.textMuted },
  list: { paddingHorizontal: spacing(5), paddingBottom: spacing(10) },
});
