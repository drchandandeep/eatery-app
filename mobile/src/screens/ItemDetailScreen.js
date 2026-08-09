// screens/ItemDetailScreen.js
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';
import Button from '../components/Button';
import { useCart } from '../context/CartContext';

export default function ItemDetailScreen({ route, navigation }) {
  const { itemId } = route.params;
  const [item, setItem] = useState(null);
  const [selections, setSelections] = useState({}); // groupId -> Set(choiceId) or single choiceId
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();

  useEffect(() => {
    api.getItem(itemId).then(({ item: fetched }) => {
      setItem(fetched);
      // default-select first choice of each required single-select group
      const defaults = {};
      fetched.option_groups.forEach((g) => {
        if (g.required && g.max_select === 1 && g.choices.length) {
          defaults[g.id] = g.choices[0].id;
        }
      });
      setSelections(defaults);
      setLoading(false);
    });
  }, [itemId]);

  function toggleChoice(group, choiceId) {
    setSelections((prev) => {
      if (group.max_select === 1) {
        return { ...prev, [group.id]: choiceId };
      }
      const current = new Set(prev[group.id] || []);
      current.has(choiceId) ? current.delete(choiceId) : current.add(choiceId);
      if (current.size > group.max_select) return prev; // enforce max
      return { ...prev, [group.id]: current };
    });
  }

  const selectedOptions = useMemo(() => {
    if (!item) return [];
    const result = [];
    item.option_groups.forEach((g) => {
      const sel = selections[g.id];
      if (!sel) return;
      const ids = g.max_select === 1 ? [sel] : Array.from(sel);
      ids.forEach((choiceId) => {
        const choice = g.choices.find((c) => c.id === choiceId);
        if (choice) result.push({ group: g.name, choice_id: choice.id, choice: choice.name, price_delta: choice.price_delta });
      });
    });
    return result;
  }, [selections, item]);

  const totalPrice = useMemo(() => {
    if (!item) return 0;
    return item.base_price + selectedOptions.reduce((s, o) => s + o.price_delta, 0);
  }, [item, selectedOptions]);

  function canAddToCart() {
    if (!item) return false;
    return item.option_groups.every((g) => {
      if (!g.required) return true;
      const sel = selections[g.id];
      const count = g.max_select === 1 ? (sel ? 1 : 0) : (sel ? sel.size : 0);
      return count >= (g.min_select || 1);
    });
  }

  function handleAdd() {
    if (!canAddToCart()) {
      Alert.alert('Almost there', 'Please choose the required options before adding to cart.');
      return;
    }
    addItem({ menu_item_id: item.id, name: item.name, base_price: item.base_price, selected_options: selectedOptions });
    navigation.navigate('Cart');
  }

  if (loading || !item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.display}>{item.name}</Text>
        <Text style={[type.bodyMuted, { marginTop: spacing(2), marginBottom: spacing(5) }]}>{item.description}</Text>

        {item.option_groups.map((group) => (
          <View key={group.id} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={type.h2}>{group.name}</Text>
              {group.required ? <Text style={styles.requiredTag}>Required</Text> : <Text style={type.caption}>Optional</Text>}
            </View>
            {group.choices.map((choice) => {
              const sel = selections[group.id];
              const isSelected = group.max_select === 1 ? sel === choice.id : sel?.has(choice.id);
              return (
                <Pressable key={choice.id} style={styles.choiceRow} onPress={() => toggleChoice(group, choice.id)}>
                  <View style={[styles.radio, group.max_select > 1 && styles.checkbox, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[type.body, { flex: 1 }]}>{choice.name}</Text>
                  {choice.price_delta > 0 && <Text style={type.bodyMuted}>+${choice.price_delta.toFixed(2)}</Text>}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerPrice}>${totalPrice.toFixed(2)}</Text>
        <Button title="Add to cart" onPress={handleAdd} style={{ flex: 1, marginLeft: spacing(4) }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing(5), paddingBottom: spacing(10) },
  group: { marginBottom: spacing(5) },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) },
  requiredTag: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, marginRight: spacing(3), alignItems: 'center', justifyContent: 'center' },
  checkbox: { borderRadius: 5 },
  radioSelected: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(5),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  footerPrice: { ...type.display, fontSize: 20 },
});
