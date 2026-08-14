// screens/CheckoutScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import Button from '../components/Button';
import RazorpayWebViewCheckout from '../components/RazorpayWebViewCheckout';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { showAlert } from '../utils/alert';
import { openRazorpayWeb } from '../utils/razorpayWeb';

// Client-side estimate only, shown before the order is placed -- the real,
// authoritative total is always recomputed server-side (see
// backend/routes/orders.js) from the actual cart, so these just need to
// match that for the estimate to be accurate, not to be trusted for billing.
const TAX_RATE = 0.05; // India GST for restaurants (non-AC/composition scheme)
const DELIVERY_FEE = 50; // flat delivery fee in rupees

const PAYMENT_METHODS = [
  { key: 'online', label: 'Pay online (UPI / Card / Netbanking)' },
  { key: 'cash', label: 'Cash on delivery' },
];

export default function CheckoutScreen({ navigation }) {
  const { lines, subtotal, clearCart } = useCart();
  const { user } = useAuth();
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState('online');
  const [placing, setPlacing] = useState(false);

  // Native-only: drives the WebView checkout modal. Unused on web, where
  // openRazorpayWeb() handles everything directly without a modal.
  const [razorpayVisible, setRazorpayVisible] = useState(false);
  const [razorpayOptions, setRazorpayOptions] = useState(null);

  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + DELIVERY_FEE;

  function currentCartItems() {
    return lines.map((l) => ({
      menu_item_id: l.menu_item_id,
      quantity: l.quantity,
      selected_options: l.selected_options,
    }));
  }

  async function handlePlaceOrder() {
    if (!address.trim()) {
      showAlert('Delivery address needed', 'Please add where we should deliver your order.');
      return;
    }
    if (payment === 'cash') {
      await placeCashOrder();
    } else {
      await startOnlinePayment();
    }
  }

  async function placeCashOrder() {
    setPlacing(true);
    try {
      const { order } = await api.placeOrder({
        items: currentCartItems(),
        address_line: address.trim(),
      });
      clearCart();
      navigation.replace('OrderTracking', { orderId: order.id });
    } catch (err) {
      showAlert('Could not place order', err.message);
    } finally {
      setPlacing(false);
    }
  }

  async function startOnlinePayment() {
    setPlacing(true);
    try {
      const { razorpay_order_id, amount, currency, key_id } = await api.createPaymentOrder({
        items: currentCartItems(),
        address_line: address.trim(),
      });

      const options = {
        key: key_id,
        amount,
        currency,
        order_id: razorpay_order_id,
        name: 'Kahumbo',
        description: 'Order payment',
        prefill: { name: user?.name, email: user?.email },
        theme: { color: '#8a5cf6' },
      };

      if (Platform.OS === 'web') {
        const response = await openRazorpayWeb(options);
        await completeOnlineOrder(response);
      } else {
        setRazorpayOptions(options);
        setRazorpayVisible(true);
        // placing stays true until the WebView modal resolves via one of
        // its callbacks below -- see handleNativeSuccess/Failure/Cancel.
        return;
      }
    } catch (err) {
      showAlert('Payment could not be started', err.message);
      setPlacing(false);
    }
  }

  async function completeOnlineOrder(razorpayResponse) {
    try {
      const { order } = await api.verifyAndPlaceOrder({
        items: currentCartItems(),
        address_line: address.trim(),
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature,
      });
      clearCart();
      navigation.replace('OrderTracking', { orderId: order.id });
    } catch (err) {
      showAlert('Payment succeeded but the order could not be confirmed', err.message);
    } finally {
      setPlacing(false);
    }
  }

  function handleNativeSuccess(payload) {
    setRazorpayVisible(false);
    completeOnlineOrder(payload);
  }

  function handleNativeFailure(payload) {
    setRazorpayVisible(false);
    setPlacing(false);
    showAlert('Payment failed', payload?.description || 'Please try again.');
  }

  function handleNativeCancel() {
    setRazorpayVisible(false);
    setPlacing(false);
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
        <View style={{ gap: spacing(2) }}>
          {PAYMENT_METHODS.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setPayment(m.key)}
              style={[styles.paymentRow, payment === m.key && styles.paymentRowActive]}
            >
              <View style={[styles.radio, payment === m.key && styles.radioActive]} />
              <Text style={[type.body, payment === m.key && { color: colors.text, fontWeight: '600' }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={subtotal} />
          <SummaryRow label="Delivery fee" value={DELIVERY_FEE} />
          <SummaryRow label="Tax (GST)" value={tax} />
          <View style={styles.divider} />
          <SummaryRow label="Total" value={total} bold />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title={`Place order · ₹${Math.round(total)}`} onPress={handlePlaceOrder} loading={placing} />
      </View>

      <RazorpayWebViewCheckout
        visible={razorpayVisible}
        options={razorpayOptions}
        onSuccess={handleNativeSuccess}
        onFailure={handleNativeFailure}
        onCancel={handleNativeCancel}
      />
    </View>
  );
}

function SummaryRow({ label, value, bold }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={bold ? type.h2 : type.bodyMuted}>{label}</Text>
      <Text style={bold ? type.h2 : type.body}>₹{Math.round(value)}</Text>
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
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  paymentRowActive: { borderColor: colors.accent },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  summary: { marginTop: spacing(8), backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing(4), borderWidth: 1, borderColor: colors.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1.5) },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing(2) },
  footer: { padding: spacing(5), borderTopWidth: 1, borderTopColor: colors.border },
});
