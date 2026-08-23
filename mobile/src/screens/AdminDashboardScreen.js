// screens/AdminDashboardScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Switch, TextInput, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';
import Button from '../components/Button';
import { showAlert } from '../utils/alert';

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
          <StoreAvailabilityCard store={store} onUpdated={(s) => setStore(s)} />
          <OrderQrCard store={store} onUpdated={(s) => setStore(s)} />

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

function StoreAvailabilityCard({ store, onUpdated }) {
  const [opensAt, setOpensAt] = useState(store?.opens_at || '12:00');
  const [closesAt, setClosesAt] = useState(store?.closes_at || '20:00');
  const [savingHours, setSavingHours] = useState(false);
  const [togglingOrders, setTogglingOrders] = useState(false);

  useEffect(() => {
    setOpensAt(store?.opens_at || '12:00');
    setClosesAt(store?.closes_at || '20:00');
  }, [store?.opens_at, store?.closes_at]);

  async function saveHours() {
    setSavingHours(true);
    try {
      const { store: s } = await api.updateStore({ opens_at: opensAt, closes_at: closesAt });
      onUpdated(s);
      showAlert('Saved', `Store hours updated to ${s.opens_at}\u2013${s.closes_at}.`);
    } catch (err) {
      showAlert('Could not save hours', err.message);
    } finally {
      setSavingHours(false);
    }
  }

  async function toggleAccepting(value) {
    setTogglingOrders(true);
    try {
      const { store: s } = await api.updateStore({ accepting_orders: value });
      onUpdated(s);
    } catch (err) {
      showAlert('Could not update', err.message);
    } finally {
      setTogglingOrders(false);
    }
  }

  if (!store) return null;

  return (
    <View style={[styles.card, { marginTop: spacing(5) }]}>
      <Text style={type.h2}>Store availability</Text>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.body}>Accepting orders</Text>
          <Text style={type.bodyMuted}>
            Turn this off any time -- e.g. during a rush -- to pause new orders instantly, even within your open hours.
          </Text>
        </View>
        <Switch
          value={!!store.accepting_orders}
          onValueChange={toggleAccepting}
          disabled={togglingOrders}
          trackColor={{ false: colors.border, true: colors.accentSoft }}
          thumbColor={store.accepting_orders ? colors.accent : colors.surface}
        />
      </View>

      <Text style={[type.body, { marginTop: spacing(5) }]}>Operating hours</Text>
      <Text style={[type.bodyMuted, { marginBottom: spacing(3) }]}>Customers can only order during this window (24h, e.g. 12:00).</Text>
      <View style={styles.hoursRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hoursLabel}>Opens</Text>
          <TextInput
            style={styles.hoursInput}
            value={opensAt}
            onChangeText={setOpensAt}
            placeholder="12:00"
            placeholderTextColor={colors.textMuted}
            maxLength={5}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hoursLabel}>Closes</Text>
          <TextInput
            style={styles.hoursInput}
            value={closesAt}
            onChangeText={setClosesAt}
            placeholder="20:00"
            placeholderTextColor={colors.textMuted}
            maxLength={5}
          />
        </View>
      </View>
      <Button
        title={savingHours ? 'Saving...' : 'Save hours'}
        variant="outline"
        onPress={saveHours}
        disabled={savingHours}
        style={{ marginTop: spacing(3) }}
      />
    </View>
  );
}

function OrderQrCard({ store, onUpdated }) {
  const [qrImage, setQrImage] = useState(null); // { uri, base64, mime } picked but not yet saved
  const [upiId, setUpiId] = useState(store?.order_upi_id || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUpiId(store?.order_upi_id || '');
  }, [store?.order_upi_id]);

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Photo access needed', 'Allow photo library access to add your payment QR code.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setQrImage({ uri: asset.uri, base64: asset.base64, mime: asset.mimeType || 'image/jpeg' });
    }
  }

  async function save() {
    if (!qrImage && upiId === (store?.order_upi_id || '')) return;
    setSaving(true);
    try {
      const { store: s } = await api.updateStore({
        order_qr_image_base64: qrImage ? `data:${qrImage.mime};base64,${qrImage.base64}` : undefined,
        order_upi_id: upiId.trim() || null,
      });
      onUpdated(s);
      setQrImage(null);
      showAlert('Saved', 'Your order-payment QR code has been updated.');
    } catch (err) {
      showAlert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!store) return null;
  const hasQr = !!store.order_qr_image_base64;

  return (
    <View style={[styles.card, { marginTop: spacing(5) }]}>
      <Text style={type.h2}>Order payment QR</Text>
      <Text style={[type.bodyMuted, { marginTop: spacing(1) }]}>
        Shown to customers at checkout as "Pay online". Without one set, customers only see Cash on Delivery.
      </Text>

      {qrImage ? (
        <Image source={{ uri: qrImage.uri }} style={styles.qrImage} resizeMode="contain" />
      ) : hasQr ? (
        <Image source={{ uri: store.order_qr_image_base64 }} style={styles.qrImage} resizeMode="contain" />
      ) : (
        <View style={[styles.qrImage, styles.qrPlaceholder]}>
          <Text style={type.bodyMuted}>No QR code set yet</Text>
        </View>
      )}

      <Text style={[styles.hoursLabel, { marginTop: spacing(4) }]}>UPI ID (optional)</Text>
      <TextInput
        style={styles.hoursInput}
        value={upiId}
        onChangeText={setUpiId}
        placeholder="yourname@upi"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />

      <Button
        title={qrImage ? 'Choose a different image' : hasQr ? 'Change QR code' : 'Upload QR code'}
        variant="outline"
        onPress={pickImage}
        style={{ marginTop: spacing(3) }}
      />
      {(qrImage || upiId !== (store?.order_upi_id || '')) && (
        <Button title="Save" onPress={save} loading={saving} style={{ marginTop: spacing(2) }} />
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginTop: spacing(3) },
  hoursRow: { flexDirection: 'row', gap: spacing(3) },
  hoursLabel: { ...type.caption, marginBottom: spacing(1) },
  hoursInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    color: colors.text,
    fontSize: 15,
    textAlign: 'center',
  },
  qrImage: { width: 180, height: 180, borderRadius: radius.sm, marginTop: spacing(3), alignSelf: 'center', backgroundColor: colors.bg },
  qrPlaceholder: { alignItems: 'center', justifyContent: 'center' },
});
