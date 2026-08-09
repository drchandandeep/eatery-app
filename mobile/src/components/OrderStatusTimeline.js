// components/OrderStatusTimeline.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, type } from '../theme';

const STEPS = [
  { key: 'placed', label: 'Order placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

export default function OrderStatusTimeline({ status }) {
  const currentIndex = STEPS.findIndex((s) => s.key === status);
  const isCancelled = status === 'cancelled';

  if (isCancelled) {
    return (
      <View style={styles.cancelledBox}>
        <Text style={[type.h2, { color: colors.danger }]}>Order cancelled</Text>
      </View>
    );
  }

  return (
    <View>
      {STEPS.map((step, i) => {
        const done = i <= currentIndex;
        const isLast = i === STEPS.length - 1;
        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.markerCol}>
              <View style={[styles.dot, done && styles.dotDone]} />
              {!isLast && <View style={[styles.line, i < currentIndex && styles.lineDone]} />}
            </View>
            <Text style={[type.body, done ? styles.labelDone : styles.labelPending]}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 44 },
  markerCol: { alignItems: 'center', width: 24 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.border },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  line: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.success },
  labelDone: { color: colors.text, fontWeight: '700', marginLeft: spacing(3), marginTop: -2 },
  labelPending: { color: colors.textMuted, marginLeft: spacing(3), marginTop: -2 },
  cancelledBox: { padding: spacing(4), backgroundColor: colors.surface, borderRadius: 12 },
});
