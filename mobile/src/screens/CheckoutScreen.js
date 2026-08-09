// screens/CheckoutScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import Button from '../components/Button';
import { useCart } from '../context/CartContext';
import { api } from '../api/client';

const TAX_RATE = 0.08;
const DELIVERY_FEE = 2.99;
const PAYMENT_METHODS = [
  { key: 'card', label: 'Card' },
  { key: 'cash', label: 'Cash on delivery' },
  { key: 'wallet', label: 'Wallet' },
];

export default function CheckoutScreen({ navigation }) {
  const { lines, subtotal, clearCart } = useCart();
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState('card');
  const [placing, setPlacing] = useState(false);

  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + DELIVERY_FEE;

  async function handlePlaceOrder() {
    if (!address.trim()) {
      Alert.alert('Delivery address needed', 'Please add where we should deliver your order.');
      return;
    }
    setPlacing(true);
    try {
      const { order } = await api.placeOrder({
        items: lines.map((l) => ({
          menu_item_id: l.menu_item_id,
          quantity: l.quantity,
          selected_options: l.selected_options,
        })),
        address_line: address.trim(),
        payment_method: payment,
      });
      clearCart();
      navigation.replace('OrderTracking', { orderId: order.id });
    } catch (err) {
      Alert.alert('Could not place order', err.message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.display, { marginBottom: spacing(5) }]}>Checkout</Text>

        <Text style={styles.label}>Delivery address</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Street, city, zip"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Text style={[styles.label, { marginTop: spacing(5) }]}>Payment method</Text>
        <View style={styles.paymentRow}>
          {PAYMENT_METHODS.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setPayment(m.key)}
              style={[styles.paymentChip, payment === m.key && styles.paymentChipActive]}
            >
              <Text style={[styles.paymentChipText, payment === m.key && styles.paymentChipTextActive]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={subtotal} />
          <SummaryRow label="Delivery fee" value={DELIVERY_FEE} />
          <SummaryRow label="Tax" value={tax} />
          <View style={styles.divider} />
          <SummaryRow label="Total" value={total} bold />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title={`Place order · $${total.toFixed(2)}`} onPress={handlePlaceOrder} loading={placing} />
      </View>
    </View>
  );
}

function SummaryRow({ label, value, bold }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={bold ? type.h2 : type.bodyMuted}>{label}</Text>
      <Text style={bold ? type.h2 : type.body}>${value.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(5), paddingTop: spacing(14), paddingBottom: spacing(10) },
  label: { ...type.caption, marginBottom: spacing(1.5) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    color: colors.text,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  paymentRow: { flexDirection: 'row', gap: spacing(2) },
  paymentChip: {
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing(2),
  },
  paymentChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  paymentChipText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  paymentChipTextActive: { color: colors.white },
  summary: { marginTop: spacing(8), backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing(4), borderWidth: 1, borderColor: colors.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1.5) },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing(2) },
  footer: { padding: spacing(5), borderTopWidth: 1, borderTopColor: colors.border },
});
