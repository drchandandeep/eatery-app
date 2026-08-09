// screens/AdminMenuScreen.js
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Switch,
} from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';
import Button from '../components/Button';
import { showAlert } from '../utils/alert';

const emptyItemForm = { name: '', description: '', base_price: '', is_veg: true };

export default function AdminMenuScreen({ navigation }) {
  const [categories, setCategories] = useState([]);
  const [uncategorized, setUncategorized] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  // Which category currently has its "add item" form open, and that form's fields.
  const [addingItemTo, setAddingItemTo] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);

  // Which existing item is currently being edited, and its editable fields.
  const [editingItemId, setEditingItemId] = useState(null);
  const [editForm, setEditForm] = useState(emptyItemForm);

  const load = useCallback(() => {
    api
      .adminGetMenu()
      .then(({ categories: cats, uncategorized: un }) => {
        setCategories(cats);
        setUncategorized(un || []);
      })
      .catch((err) => showAlert('Could not load menu', err.message))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    try {
      await api.adminCreateCategory({ name: newCategoryName.trim() });
      setNewCategoryName('');
      setAddingCategory(false);
      load();
    } catch (err) {
      showAlert('Could not add category', err.message);
    }
  }

  async function handleDeleteCategory(cat) {
    try {
      await api.adminDeleteCategory(cat.id);
      load();
    } catch (err) {
      showAlert('Could not delete category', err.message);
    }
  }

  function startAddItem(categoryId) {
    setAddingItemTo(categoryId);
    setItemForm(emptyItemForm);
  }

  async function submitAddItem(categoryId) {
    if (!itemForm.name.trim() || !itemForm.base_price) {
      showAlert('Missing info', 'Item name and price are required.');
      return;
    }
    try {
      await api.adminCreateItem({
        category_id: categoryId,
        name: itemForm.name.trim(),
        description: itemForm.description.trim(),
        base_price: Number(itemForm.base_price),
        is_veg: itemForm.is_veg,
      });
      setAddingItemTo(null);
      setItemForm(emptyItemForm);
      load();
    } catch (err) {
      showAlert('Could not add item', err.message);
    }
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setEditForm({
      name: item.name,
      description: item.description || '',
      base_price: String(item.base_price),
      is_veg: !!item.is_veg,
    });
  }

  async function submitEditItem(itemId) {
    if (!editForm.name.trim() || !editForm.base_price) {
      showAlert('Missing info', 'Item name and price are required.');
      return;
    }
    try {
      await api.adminUpdateItem(itemId, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        base_price: Number(editForm.base_price),
        is_veg: editForm.is_veg,
      });
      setEditingItemId(null);
      load();
    } catch (err) {
      showAlert('Could not update item', err.message);
    }
  }

  async function toggleAvailable(item) {
    try {
      await api.adminUpdateItem(item.id, { is_available: item.is_available ? 0 : 1 });
      load();
    } catch (err) {
      showAlert('Could not update item', err.message);
    }
  }

  async function handleDeleteItem(item) {
    try {
      await api.adminDeleteItem(item.id);
      load();
    } catch (err) {
      showAlert('Could not delete item', err.message);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={type.display}>Manage menu</Text>
      <Text style={[type.bodyMuted, { marginBottom: spacing(5) }]}>
        Changes here go live for customers immediately.
      </Text>

      {categories.map((cat) => (
        <View key={cat.id} style={styles.categoryBlock}>
          <View style={styles.categoryHeader}>
            <Text style={type.h2}>{cat.name}</Text>
            <Pressable onPress={() => handleDeleteCategory(cat)}>
              <Text style={styles.deleteLink}>Delete category</Text>
            </Pressable>
          </View>

          {cat.items.length === 0 && (
            <Text style={[type.bodyMuted, { marginBottom: spacing(2) }]}>No items yet.</Text>
          )}

          {cat.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              editing={editingItemId === item.id}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={() => startEditItem(item)}
              onCancelEdit={() => setEditingItemId(null)}
              onSubmitEdit={() => submitEditItem(item.id)}
              onToggleAvailable={() => toggleAvailable(item)}
              onDelete={() => handleDeleteItem(item)}
            />
          ))}

          {addingItemTo === cat.id ? (
            <ItemForm
              form={itemForm}
              setForm={setItemForm}
              onCancel={() => setAddingItemTo(null)}
              onSubmit={() => submitAddItem(cat.id)}
              submitLabel="Add item"
            />
          ) : (
            <Button title="+ Add item" variant="outline" onPress={() => startAddItem(cat.id)} style={{ marginTop: spacing(2) }} />
          )}
        </View>
      ))}

      {uncategorized.length > 0 && (
        <View style={styles.categoryBlock}>
          <Text style={type.h2}>Uncategorized</Text>
          {uncategorized.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              editing={editingItemId === item.id}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={() => startEditItem(item)}
              onCancelEdit={() => setEditingItemId(null)}
              onSubmitEdit={() => submitEditItem(item.id)}
              onToggleAvailable={() => toggleAvailable(item)}
              onDelete={() => handleDeleteItem(item)}
            />
          ))}
        </View>
      )}

      <View style={[styles.categoryBlock, { marginTop: spacing(2) }]}>
        {addingCategory ? (
          <View>
            <Text style={styles.label}>New category name</Text>
            <TextInput
              style={styles.input}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="e.g. Beverages"
              placeholderTextColor={colors.textMuted}
            />
            <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) }}>
              <Button title="Add category" onPress={handleAddCategory} style={{ flex: 1 }} />
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => {
                  setAddingCategory(false);
                  setNewCategoryName('');
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <Button title="+ Add category" onPress={() => setAddingCategory(true)} />
        )}
      </View>

      <Button title="Back to dashboard" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: spacing(4) }} />
    </ScrollView>
  );
}

function ItemRow({ item, editing, editForm, setEditForm, onStartEdit, onCancelEdit, onSubmitEdit, onToggleAvailable, onDelete }) {
  if (editing) {
    return <ItemForm form={editForm} setForm={setEditForm} onCancel={onCancelEdit} onSubmit={onSubmitEdit} submitLabel="Save changes" />;
  }
  return (
    <View style={styles.itemRow}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, !item.is_available && { color: colors.textMuted }]}>
          {item.name} {!item.is_available && '(hidden)'}
        </Text>
        {!!item.description && <Text style={type.caption}>{item.description}</Text>}
        <Text style={type.price}>${Number(item.base_price).toFixed(2)}</Text>
      </View>
      <View style={styles.itemActions}>
        <View style={{ alignItems: 'center' }}>
          <Text style={type.caption}>{item.is_available ? 'Available' : 'Hidden'}</Text>
          <Switch value={!!item.is_available} onValueChange={onToggleAvailable} trackColor={{ true: colors.accent }} />
        </View>
        <Pressable onPress={onStartEdit}>
          <Text style={styles.editLink}>Edit</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <Text style={styles.deleteLink}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ItemForm({ form, setForm, onCancel, onSubmit, submitLabel }) {
  return (
    <View style={styles.itemForm}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={form.name}
        onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={form.description}
        onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.label}>Price ($)</Text>
      <TextInput
        style={styles.input}
        value={form.base_price}
        onChangeText={(v) => setForm((f) => ({ ...f, base_price: v }))}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.textMuted}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing(3) }}>
        <Text style={[type.body, { flex: 1 }]}>Vegetarian</Text>
        <Switch value={form.is_veg} onValueChange={(v) => setForm((f) => ({ ...f, is_veg: v }))} trackColor={{ true: colors.success }} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(4) }}>
        <Button title={submitLabel} onPress={onSubmit} style={{ flex: 1 }} />
        <Button title="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing(5), paddingTop: spacing(14), paddingBottom: spacing(10) },
  categoryBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing(3),
  },
  itemActions: { alignItems: 'center', gap: spacing(2) },
  editLink: { color: colors.accentSoft, fontWeight: '700', fontSize: 12 },
  deleteLink: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  itemForm: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(3),
    marginTop: spacing(2),
  },
  label: { ...type.caption, marginTop: spacing(3), marginBottom: spacing(1.5) },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    color: colors.text,
    fontSize: 14,
  },
});
