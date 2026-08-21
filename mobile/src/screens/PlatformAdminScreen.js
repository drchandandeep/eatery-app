// screens/PlatformAdminScreen.js
// Only reachable by the platform_admin role (see navigation/index.js) --
// this is the platform owner's own review queue for store subscription
// payment proofs. Approving here is the one and only thing that activates
// a store's subscription (see routes/platform.js).
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';
import Button from '../components/Button';
import { showAlert } from '../utils/alert';
import { useAuth } from '../context/AuthContext';

export default function PlatformAdminScreen() {
  const { logout } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(() => {
    api
      .platformSubscriptionRequests('pending')
      .then(({ requests: r }) => setRequests(r))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

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

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={type.display}>Approvals</Text>
          <Text style={type.bodyMuted}>Subscription payment proofs awaiting review</Text>
        </View>
        <Button title="Log out" variant="outline" onPress={logout} />
      </View>

      <FlatList
        data={requests}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
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
});
