// screens/OrderHistoryScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';

const STATUS_LABEL = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export default function OrderHistoryScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    api.getOrders().then(({ orders: o }) => setOrders(o)).finally(() => {
      setLoading(false);
      setRefreshing(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  return (
    <View style={styles.screen}>
      <Text style={[type.display, styles.title]}>Your orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={type.bodyMuted}>No orders yet — go place one!</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}>
            <View style={{ flex: 1 }}>
              <Text style={type.h2}>Order #{item.id.slice(0, 6).toUpperCase()}</Text>
              <Text style={type.bodyMuted}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
            <View style={styles.right}>
              <Text style={type.price}>${item.total.toFixed(2)}</Text>
              <Text style={styles.status}>{STATUS_LABEL[item.status] || item.status}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  title: { paddingHorizontal: spacing(5), paddingTop: spacing(14), paddingBottom: spacing(3) },
  list: { paddingHorizontal: spacing(5), paddingBottom: spacing(10) },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(4),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
  },
  right: { alignItems: 'flex-end' },
  status: { ...type.caption, color: colors.accentSoft, marginTop: spacing(1) },
});
