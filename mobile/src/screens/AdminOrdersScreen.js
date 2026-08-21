// screens/AdminOrdersScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';

const NEXT_STATUS = {
  placed: 'confirmed',
  confirmed: 'preparing',
  preparing: 'out_for_delivery',
  out_for_delivery: 'delivered',
};
const STATUS_LABEL = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export default function AdminOrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [etaDrafts, setEtaDrafts] = useState({}); // orderId -> string being typed

  const load = useCallback(() => {
    api.adminOrders().then(({ orders: o }) => setOrders(o)).finally(() => {
      setLoading(false);
      setRefreshing(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function advance(order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setUpdatingId(order.id);
    try {
      const etaMinutes = etaDrafts[order.id];
      await api.adminUpdateOrderStatus(order.id, next, etaMinutes ? Number(etaMinutes) : undefined);
      setEtaDrafts((d) => ({ ...d, [order.id]: '' }));
      load();
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <View style={styles.screen}>
      <Text style={[type.display, styles.title]}>Live orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={type.bodyMuted}>No orders yet.</Text>}
        renderItem={({ item }) => {
          const next = NEXT_STATUS[item.status];
          return (
            <View style={styles.card}>
              <Text style={type.h2}>#{item.id.slice(0, 6).toUpperCase()} · ₹{Math.round(item.total)}</Text>
              <Text style={type.bodyMuted}>{item.address_line}</Text>
              <Text style={styles.status}>
                {STATUS_LABEL[item.status]}
                {item.estimated_delivery_minutes != null ? ` · ETA ${item.estimated_delivery_minutes} min` : ''}
              </Text>

              {next && (
                <>
                  <View style={styles.etaRow}>
                    <TextInput
                      style={styles.etaInput}
                      placeholder="ETA in minutes (optional)"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      value={etaDrafts[item.id] || ''}
                      onChangeText={(v) => setEtaDrafts((d) => ({ ...d, [item.id]: v.replace(/[^0-9]/g, '') }))}
                    />
                  </View>
                  <Pressable
                    style={styles.advanceBtn}
                    onPress={() => advance(item)}
                    disabled={updatingId === item.id}
                  >
                    <Text style={styles.advanceBtnText}>
                      {updatingId === item.id ? 'Updating…' : `Mark ${STATUS_LABEL[next]}`}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          );
        }}
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
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(4),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
  },
  status: { ...type.caption, color: colors.accentSoft, marginTop: spacing(1) },
  etaRow: { marginTop: spacing(3) },
  etaInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    color: colors.text,
    fontSize: 13,
  },
  advanceBtn: { marginTop: spacing(2), backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: spacing(2.5), alignItems: 'center' },
  advanceBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
});

