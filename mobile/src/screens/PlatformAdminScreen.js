// screens/PlatformAdminScreen.js
// Only reachable by the platform_admin role (see navigation/index.js) --
// this is the platform owner's own review queue for store subscription
// payment proofs, plus management of the platform's own payment QR code.
// Approving a request here is the one and only thing that activates a
// store's subscription (see routes/platform.js).
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, FlatList, StyleSheet, ActivityIndicator, RefreshControl, TextInput, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';
import Button from '../components/Button';
import { showAlert } from '../utils/alert';
import { useAuth } from '../context/AuthContext';

export default function PlatformAdminScreen({ navigation }) {
  const { logout } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState(null);

  const [qr, setQr] = useState(null); // { image_base64, upi_id } | null
  const [loadingQr, setLoadingQr] = useState(true);
  const [newQrImage, setNewQrImage] = useState(null); // { uri, base64, mime } picked but not yet saved
  const [upiIdInput, setUpiIdInput] = useState('');
  const [savingQr, setSavingQr] = useState(false);

  const [reports, setReports] = useState(null); // { totals, stores } | null
  const [loadingReports, setLoadingReports] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState(null); // null = show totals across all stores
  const [storeReport, setStoreReport] = useState(null);
  const [loadingStoreReport, setLoadingStoreReport] = useState(false);

  const load = useCallback(() => {
    api
      .platformSubscriptionRequests('pending')
      .then(({ requests: r }) => setRequests(r))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
    api
      .platformGetQrCode()
      .then((data) => {
        setQr(data);
        setUpiIdInput(data.upi_id || '');
      })
      .catch(() => {})
      .finally(() => setLoadingQr(false));
    api
      .platformReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedStoreId) {
      setStoreReport(null);
      return;
    }
    setLoadingStoreReport(true);
    api
      .platformStoreReport(selectedStoreId)
      .then(setStoreReport)
      .catch(() => {})
      .finally(() => setLoadingStoreReport(false));
  }, [selectedStoreId]);

  async function approve(id) {
    setActingId(id);
    try {
      const { message } = await api.platformApproveRequest(id);
      showAlert('Approved', message);
      load();
    } catch (err) {
      showAlert('Could not approve', err.message);
    } finally {
      setActingId(null);
    }
  }

  async function reject(id) {
    setActingId(id);
    try {
      await api.platformRejectRequest(id);
      showAlert('Rejected', 'The store owner can resubmit with a new screenshot.');
      load();
    } catch (err) {
      showAlert('Could not reject', err.message);
    } finally {
      setActingId(null);
    }
  }

  async function pickQrImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Photo access needed', 'Allow photo library access to upload your QR code.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setNewQrImage({ uri: asset.uri, base64: asset.base64, mime: asset.mimeType || 'image/jpeg' });
    }
  }

  async function saveQr() {
    if (!newQrImage) {
      showAlert('Choose an image', 'Pick a QR code image from your gallery first.');
      return;
    }
    setSavingQr(true);
    try {
      await api.platformSetQrCode({
        image_base64: `data:${newQrImage.mime};base64,${newQrImage.base64}`,
        upi_id: upiIdInput.trim() || undefined,
      });
      showAlert('Saved', 'Your payment QR code has been updated.');
      setNewQrImage(null);
      load();
    } catch (err) {
      showAlert('Could not save QR code', err.message);
    } finally {
      setSavingQr(false);
    }
  }

  const hasQr = !!qr?.image_base64;

  const reportsSection = (
    <View style={styles.qrCard}>
      <Text style={type.h2}>Reports</Text>
      <Text style={[type.bodyMuted, { marginTop: spacing(1), marginBottom: spacing(3) }]}>
        Totals across every store, or pick one below for its own numbers.
      </Text>

      {loadingReports ? (
        <ActivityIndicator color={colors.accent} />
      ) : reports ? (
        <>
          <View style={styles.statsRow}>
            <StatBox label="Stores" value={reports.totals.total_stores} />
            <StatBox label="Orders" value={reports.totals.total_orders} />
            <StatBox label="Revenue" value={`\u20b9${Math.round(reports.totals.total_revenue).toLocaleString('en-IN')}`} />
          </View>

          <Text style={[styles.label, { marginTop: spacing(4) }]}>View a specific store</Text>
          <View style={styles.chipsWrap}>
            <Pressable
              onPress={() => setSelectedStoreId(null)}
              style={[styles.chip, !selectedStoreId && styles.chipActive]}
            >
              <Text style={[styles.chipText, !selectedStoreId && styles.chipTextActive]}>All stores</Text>
            </Pressable>
            {reports.stores.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setSelectedStoreId(s.id)}
                style={[styles.chip, selectedStoreId === s.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, selectedStoreId === s.id && styles.chipTextActive]}>{s.name}</Text>
              </Pressable>
            ))}
          </View>

          {selectedStoreId && (
            loadingStoreReport ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: spacing(3) }} />
            ) : storeReport ? (
              <View style={{ marginTop: spacing(3) }}>
                <Text style={type.body}>{storeReport.store.name}</Text>
                <Text style={type.bodyMuted}>
                  Subscription: {storeReport.store.subscription_status} · ₹{Math.round(storeReport.store.annual_fee)}/year
                </Text>
                <View style={styles.statsRow}>
                  <StatBox label="Orders" value={storeReport.order_count} />
                  <StatBox label="Revenue" value={`\u20b9${Math.round(storeReport.revenue).toLocaleString('en-IN')}`} />
                </View>
              </View>
            ) : null
          )}
        </>
      ) : (
        <Text style={type.bodyMuted}>Could not load reports.</Text>
      )}
    </View>
  );

  const qrSection = (
    <View style={styles.qrCard}>
      <Text style={type.h2}>Your payment QR code</Text>
      <Text style={[type.bodyMuted, { marginTop: spacing(1) }]}>
        Store owners scan this to pay their annual subscription fee.
      </Text>

      {loadingQr ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing(4) }} />
      ) : (
        <>
          {newQrImage ? (
            <Image source={{ uri: newQrImage.uri }} style={styles.qrImage} resizeMode="contain" />
          ) : hasQr ? (
            <Image source={{ uri: qr.image_base64 }} style={styles.qrImage} resizeMode="contain" />
          ) : (
            <View style={[styles.qrImage, styles.qrPlaceholder]}>
              <Text style={type.bodyMuted}>No QR code uploaded yet</Text>
            </View>
          )}

          <Text style={[styles.label, { marginTop: spacing(4) }]}>UPI ID (optional)</Text>
          <TextInput
            style={styles.input}
            value={upiIdInput}
            onChangeText={setUpiIdInput}
            placeholder="yourname@upi"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <Button
            title={newQrImage ? 'Choose a different image' : hasQr ? 'Change QR code' : 'Upload QR code'}
            variant="outline"
            onPress={pickQrImage}
            style={{ marginTop: spacing(3) }}
          />
          {(newQrImage || upiIdInput !== (qr?.upi_id || '')) && (
            <Button title="Save" onPress={saveQr} loading={savingQr} style={{ marginTop: spacing(2) }} />
          )}
        </>
      )}
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={type.display}>Platform Admin</Text>
          <Text style={type.bodyMuted}>Subscription payments & payment QR</Text>
        </View>
        <Button title="Log out" variant="outline" onPress={logout} />
      </View>

      <View style={{ paddingHorizontal: spacing(5), marginBottom: spacing(2) }}>
        <Button title="Change password" variant="outline" onPress={() => navigation.navigate('ChangePassword')} />
      </View>

      <FlatList
        data={requests}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        ListHeaderComponent={
          <>
            {reportsSection}
            {qrSection}
            <Text style={[type.h2, { marginBottom: spacing(2) }]}>Approvals</Text>
          </>
        }
        ListEmptyComponent={<Text style={type.bodyMuted}>Nothing pending review right now.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={type.h2}>{item.store_name}</Text>
            <Text style={type.bodyMuted}>{item.owner_email}</Text>
            <Text style={[type.body, { marginTop: spacing(1) }]}>₹{Math.round(item.amount)}</Text>
            {item.note ? <Text style={[type.bodyMuted, { marginTop: spacing(1) }]}>Note: {item.note}</Text> : null}
            <Image source={{ uri: item.screenshot_base64 }} style={styles.screenshot} resizeMode="contain" />
            <Text style={[type.caption, { marginTop: spacing(1) }]}>Submitted {new Date(item.created_at).toDateString()}</Text>
            <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) }}>
              <Button
                title={actingId === item.id ? 'Working...' : 'Approve'}
                onPress={() => approve(item.id)}
                disabled={actingId === item.id}
                style={{ flex: 1 }}
              />
              <Button
                title="Reject"
                variant="danger"
                onPress={() => reject(item.id)}
                disabled={actingId === item.id}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}

function StatBox({ label, value }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing(5),
    paddingTop: spacing(14),
    paddingBottom: spacing(4),
  },
  list: { paddingHorizontal: spacing(5), paddingBottom: spacing(10) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(4),
    marginBottom: spacing(4),
    borderWidth: 1,
    borderColor: colors.border,
  },
  screenshot: { width: '100%', height: 260, borderRadius: radius.sm, marginTop: spacing(3), backgroundColor: colors.bg },
  qrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(4),
    marginBottom: spacing(6),
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrImage: { width: 200, height: 200, borderRadius: radius.sm, marginTop: spacing(3), alignSelf: 'center', backgroundColor: colors.bg },
  qrPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  label: { ...type.caption, marginBottom: spacing(1.5) },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    color: colors.text,
    fontSize: 15,
  },
  statsRow: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(2) },
  statBox: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing(3),
    alignItems: 'center',
  },
  statValue: { fontWeight: '800', fontSize: 18, color: colors.accent },
  statLabel: { ...type.caption, marginTop: spacing(1) },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: {
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.white },
});
