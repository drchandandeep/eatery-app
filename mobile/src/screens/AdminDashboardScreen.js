// screens/AdminDashboardScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';
import Button from '../components/Button';

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export default function AdminDashboardScreen({ navigation }) {
  const [store, setStore] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    // myStore() always succeeds (subscription-independent) so we can show
    // billing status even when the store's subscription has lapsed and the
    // stats/orders endpoints below are blocked with 402.
    api
      .myStore()
      .then(({ store: s }) => setStore(s))
      .catch(() => {});

    api
      .adminStats()
      .then(setStats)
      .catch((err) => setStats({ error: err.message }))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  const active = store?.subscription_status === 'active';
  const pendingReview = store?.subscription_status === 'pending_review';
  const remainingDays = daysUntil(store?.subscription_expires_at);
  const expiringSoon = active && remainingDays != null && remainingDays <= 30;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
    >
      <Text style={type.display}>Admin dashboard</Text>
      <Text style={[type.bodyMuted, { marginBottom: spacing(5) }]}>{store?.name || 'Your store'}</Text>

      <SubscriptionCard
        store={store}
        active={active}
        pendingReview={pendingReview}
        remainingDays={remainingDays}
        expiringSoon={expiringSoon}
        onPay={() => navigation.navigate('SubscriptionPayment')}
      />

      {!active ? (
        <View style={[styles.card, { marginTop: spacing(5) }]}>
          <Text style={type.body}>
            Orders, menu editing and live stats are paused until your subscription is active.
            Customers are always free -- this annual fee covers the store's account.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            <StatCard label="Active orders" value={stats?.activeOrders ?? '--'} />
            <StatCard label="Total orders" value={stats?.totalOrders ?? '--'} />
            <StatCard label="Revenue" value={stats ? `\u20b9${Math.round(stats.revenue || 0)}` : '--'} wide />
          </View>

          <Text style={[type.h2, { marginTop: spacing(6), marginBottom: spacing(2) }]}>Top items</Text>
          <View style={styles.card}>
            {(!stats?.topItems || stats.topItems.length === 0) && <Text style={type.bodyMuted}>No orders yet.</Text>}
            {stats?.topItems?.map((it, i) => (
              <View key={it.name} style={styles.topRow}>
                <Text style={type.body}>{i + 1}. {it.name}</Text>
                <Text style={type.bodyMuted}>{it.qty} sold</Text>
              </View>
            ))}
          </View>

          <Button
            title="Manage live orders"
            onPress={() => navigation.navigate('AdminOrders')}
            style={{ marginTop: spacing(6) }}
          />
          <Button
            title="Manage menu"
            variant="outline"
            onPress={() => navigation.navigate('AdminMenu')}
            style={{ marginTop: spacing(3) }}
          />
        </>
      )}
    </ScrollView>
  );
}

function SubscriptionCard({ store, active, pendingReview, remainingDays, expiringSoon, onPay }) {
  if (!store) return null;
  const statusLabel = active ? 'Active' : pendingReview ? 'Pending review' : (store.subscription_status || 'inactive').toUpperCase();
  return (
    <View style={[styles.card, active ? styles.cardOk : styles.cardWarn]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={type.h2}>Annual subscription</Text>
        <View style={[styles.badge, active ? styles.badgeOk : styles.badgeWarn]}>
          <Text style={styles.badgeText}>{statusLabel}</Text>
        </View>
      </View>

      <Text style={[type.bodyMuted, { marginTop: spacing(2) }]}>
        {active
          ? `Renews on ${new Date(store.subscription_expires_at).toDateString()}${remainingDays != null ? ` (${remainingDays} days left)` : ''}`
          : pendingReview
          ? "We're reviewing your payment screenshot -- this usually takes a short while."
          : "Not currently active -- customers can't see or order from this store."}
      </Text>
      <Text style={[type.bodyMuted, { marginTop: spacing(1) }]}>
        ₹{Math.round(store.annual_fee)} / year {'\u00b7'} customers always order for free
      </Text>

      {!active && (
        <Button
          title={pendingReview ? 'Submit another payment' : expiringSoon ? 'Renew now' : 'Pay subscription'}
          variant={pendingReview ? 'outline' : 'primary'}
          onPress={onPay}
          style={{ marginTop: spacing(4) }}
        />
      )}
      {active && expiringSoon && (
        <Button title="Renew now" onPress={onPay} style={{ marginTop: spacing(4) }} />
      )}
    </View>
  );
}

function StatCard({ label, value, wide }) {
  return (
    <View style={[styles.statCard, wide && { flexBasis: '100%' }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing(5), paddingTop: spacing(14), paddingBottom: spacing(10) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginTop: spacing(5) },
  statCard: {
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.accentSoft, marginBottom: spacing(1) },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing(4), borderWidth: 1, borderColor: colors.border },
  cardOk: { borderColor: colors.border },
  cardWarn: { borderColor: colors.danger },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(2) },
  badge: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.pill },
  badgeOk: { backgroundColor: colors.success },
  badgeWarn: { backgroundColor: colors.danger },
  badgeText: { fontSize: 11, fontWeight: '800', color: colors.white },
});
