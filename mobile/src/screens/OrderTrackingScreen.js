// screens/OrderTrackingScreen.js
// Polls the order every few seconds to reflect status changes made by the
// admin dashboard -- a lightweight stand-in for websockets/push notifications.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';
import OrderStatusTimeline from '../components/OrderStatusTimeline';
import Button from '../components/Button';

const POLL_MS = 5000;

export default function OrderTrackingScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.getOrder(orderId).then(({ order: o }) => {
      setOrder(o);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (loading || !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>Order #{order.id.slice(0, 6).toUpperCase()}</Text>
      <Text style={[type.bodyMuted, { marginBottom: spacing(6) }]}>Delivering to {order.address_line}</Text>

      <View style={styles.card}>
        <OrderStatusTimeline status={order.status} />
      </View>

      <View style={styles.card}>
        <Text style={[type.h2, { marginBottom: spacing(2) }]}>Items</Text>
        {order.items?.map((it) => (
          <View key={it.id} style={styles.itemRow}>
            <Text style={type.body}>{it.quantity}× {it.name}</Text>
            <Text style={type.bodyMuted}>${(it.unit_price * it.quantity).toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.itemRow}>
          <Text style={type.h2}>Total</Text>
          <Text style={type.h2}>${order.total.toFixed(2)}</Text>
        </View>
      </View>

      <Button title="Back to menu" variant="outline" onPress={() => navigation.navigate('MenuHome')} style={{ marginTop: spacing(4) }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing(5), paddingTop: spacing(14), paddingBottom: spacing(10) },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing(4), marginBottom: spacing(4), borderWidth: 1, borderColor: colors.border },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1.5) },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing(2) },
});
