// screens/CartScreen.js
import React from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import Button from '../components/Button';
import { useCart } from '../context/CartContext';

export default function CartScreen({ navigation }) {
  const { lines, updateQuantity, removeItem, subtotal } = useCart();

  if (lines.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={type.h1}>Your cart is empty</Text>
        <Text style={[type.bodyMuted, { marginTop: spacing(2), marginBottom: spacing(6) }]}>
          Browse the menu to add something delicious.
        </Text>
        <Button title="Back to menu" onPress={() => navigation.navigate('MenuHome')} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={[type.display, styles.title]}>Your cart</Text>
      <FlatList
        data={lines}
        keyExtractor={(l) => l.key}
        contentContainerStyle={styles.list}
        renderItem={({ item: line }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={type.h2}>{line.name}</Text>
              {line.selected_options.length > 0 && (
                <Text style={type.bodyMuted} numberOfLines={2}>
                  {line.selected_options.map((o) => o.choice).join(', ')}
                </Text>
              )}
              <Text style={type.price}>₹{Math.round(line.unit_price * line.quantity)}</Text>
            </View>
            <View style={styles.qtyControl}>
              <Pressable style={styles.qtyBtn} onPress={() => updateQuantity(line.key, line.quantity - 1)}>
                <Text style={styles.qtyBtnText}>–</Text>
              </Pressable>
              <Text style={styles.qtyText}>{line.quantity}</Text>
              <Pressable style={styles.qtyBtn} onPress={() => updateQuantity(line.key, line.quantity + 1)}>
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => removeItem(line.key)} style={{ marginLeft: spacing(3) }}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.subtotalRow}>
          <Text style={type.h2}>Subtotal</Text>
          <Text style={type.h2}>₹{Math.round(subtotal)}</Text>
        </View>
        <Button title="Go to checkout" onPress={() => navigation.navigate('Checkout')} style={{ marginTop: spacing(3) }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing(6) },
  title: { paddingHorizontal: spacing(5), paddingTop: spacing(14), paddingBottom: spacing(3) },
  list: { paddingHorizontal: spacing(5), paddingBottom: spacing(4) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(3.5),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill },
  qtyBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: colors.text, fontSize: 18, fontWeight: '700' },
  qtyText: { color: colors.text, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  remove: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  footer: { padding: spacing(5), borderTopWidth: 1, borderTopColor: colors.border },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
