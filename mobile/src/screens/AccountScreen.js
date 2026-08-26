// screens/AccountScreen.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';

export default function AccountScreen({ navigation }) {
  const { user, logout } = useAuth();

  return (
    <View style={styles.screen}>
      <Text style={[type.display, { paddingHorizontal: spacing(5), paddingTop: spacing(14) }]}>Account</Text>

      <View style={styles.card}>
        <Row label="Name" value={user?.name} />
        <Row label="Email" value={user?.email} />
        <Row label="Role" value={user?.role} />
      </View>

      <View style={{ paddingHorizontal: spacing(5), marginTop: spacing(5) }}>
        <Button title="Order history" variant="outline" onPress={() => navigation.navigate('OrderHistory')} />
        {user?.role === 'store_admin' && (
          <Button
            title="Admin dashboard"
            variant="outline"
            onPress={() => navigation.navigate('AdminDashboard')}
            style={{ marginTop: spacing(3) }}
          />
        )}
        <Button
          title="Change password"
          variant="outline"
          onPress={() => navigation.navigate('ChangePassword')}
          style={{ marginTop: spacing(3) }}
        />
        <Button title="Log out" variant="danger" onPress={logout} style={{ marginTop: spacing(3) }} />
      </View>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={type.bodyMuted}>{label}</Text>
      <Text style={type.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    margin: spacing(5),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(2.5), borderBottomWidth: 1, borderBottomColor: colors.border },
});
