// components/MenuItemCard.js
import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export default function MenuItemCard({ item, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.thumb}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>{item.name.charAt(0)}</Text>
          </View>
        )}
        <View style={[styles.vegDot, { backgroundColor: item.is_veg ? colors.success : colors.danger }]} />
      </View>
      <View style={styles.info}>
        <Text style={type.h2} numberOfLines={1}>{item.name}</Text>
        <Text style={[type.bodyMuted, styles.desc]} numberOfLines={2}>{item.description}</Text>
        <Text style={type.price}>₹{Math.round(item.base_price)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(2.5),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.8 },
  thumb: { width: 68, height: 68, marginRight: spacing(3) },
  image: { width: 68, height: 68, borderRadius: radius.sm },
  placeholder: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.accentSoft, fontSize: 24, fontWeight: '800' },
  vegDot: { position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.surface },
  info: { flex: 1, justifyContent: 'center' },
  desc: { marginVertical: spacing(1) },
});
