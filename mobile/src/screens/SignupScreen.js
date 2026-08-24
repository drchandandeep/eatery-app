// screens/SignupScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { colors, spacing, type, radius } from '../theme';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { showAlert } from '../utils/alert';

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');

  const [coords, setCoords] = useState(null); // { lat, lng }
  const [locating, setLocating] = useState(false);
  const [findingStores, setFindingStores] = useState(false);
  const [nearbyStores, setNearbyStores] = useState(null); // null = not searched yet
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleFindStores() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert(
          'Location needed',
          'We use your location only to confirm you\u2019re within a store\u2019s delivery area (up to 7km). Please allow location access.'
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords({ lat, lng });

      setFindingStores(true);
      const { stores } = await api.nearbyStores(lat, lng, 7);
      setNearbyStores(stores);
      if (stores.length === 0) {
        showAlert('No stores nearby', 'There are no active stores within 7km of your current location yet.');
      }
    } catch (err) {
      showAlert('Could not get location', err.message);
    } finally {
      setLocating(false);
      setFindingStores(false);
    }
  }

  async function handleSignup() {
    if (!name || !email || !password) {
      showAlert('Missing info', 'Name, email and password are required.');
      return;
    }
    if (!coords) {
      showAlert('Location needed', 'Tap "Find stores near me" first so we can verify you\u2019re in range.');
      return;
    }
    if (!selectedStoreId) {
      showAlert('Pick a store', 'Select the store you\u2019d like to order from.');
      return;
    }
    if (!addressLine.trim()) {
      showAlert('Address needed', 'Add your delivery address line.');
      return;
    }
    setLoading(true);
    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        storeId: selectedStoreId,
        address: {
          line1: addressLine.trim(),
          city: city.trim(),
          zip: zip.trim(),
          lat: coords.lat,
          lng: coords.lng,
        },
      });
    } catch (err) {
      showAlert('Signup failed', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>Create account</Text>
      <View style={styles.rangeBanner}>
        <Text style={styles.rangeBannerText}>Orders allowed up to 7km from the store</Text>
      </View>
      <Text style={[type.bodyMuted, { marginBottom: spacing(6) }]}>
        Ordering is free for customers -- just pick your local store
      </Text>

      {[
        { label: 'Full name', value: name, set: setName, kb: 'default' },
        { label: 'Email', value: email, set: setEmail, kb: 'email-address' },
        { label: 'Phone (optional)', value: phone, set: setPhone, kb: 'phone-pad' },
      ].map((f) => (
        <View key={f.label}>
          <Text style={styles.label}>{f.label}</Text>
          <TextInput
            style={styles.input}
            value={f.value}
            onChangeText={f.set}
            keyboardType={f.kb}
            autoCapitalize="none"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      ))}

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Delivery address</Text>
      <TextInput
        style={styles.input}
        value={addressLine}
        onChangeText={setAddressLine}
        placeholder="Street address"
        placeholderTextColor={colors.textMuted}
      />
      <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(2) }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={city}
          onChangeText={setCity}
          placeholder="City"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={zip}
          onChangeText={setZip}
          placeholder="ZIP"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <Text style={[type.caption, { marginTop: spacing(5) }]}>
        We only serve customers within 7km of a registered store, so we need your current
        location to check whether you're in range. This is captured once at signup and can't
        be changed afterward.
      </Text>
      <Button
        title={locating || findingStores ? 'Finding stores...' : 'Find stores near me'}
        variant="outline"
        onPress={handleFindStores}
        loading={locating || findingStores}
        style={{ marginTop: spacing(3) }}
      />

      {nearbyStores && nearbyStores.length > 0 && (
        <View style={{ marginTop: spacing(4) }}>
          <Text style={styles.label}>Choose your store</Text>
          {nearbyStores.map((s) => {
            const selected = s.id === selectedStoreId;
            return (
              <Pressable key={s.id} onPress={() => setSelectedStoreId(s.id)} style={[styles.storeRow, selected && styles.storeRowSelected]}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{s.name}</Text>
                  <Text style={type.caption}>{s.address_line}{s.city ? `, ${s.city}` : ''}</Text>
                </View>
                <Text style={type.caption}>{s.distance_km} km</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Button title="Sign up" onPress={handleSignup} loading={loading} style={{ marginTop: spacing(5) }} />
      <Button title="Back to login" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: spacing(3) }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing(6), paddingVertical: spacing(10) },
  rangeBanner: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(4),
    marginTop: spacing(3),
    marginBottom: spacing(3),
    alignSelf: 'flex-start',
  },
  rangeBannerText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  label: { ...type.caption, marginTop: spacing(4), marginBottom: spacing(1.5) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
    color: colors.text,
    fontSize: 15,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(3.5),
    marginTop: spacing(2),
  },
  storeRowSelected: {
    borderColor: colors.accent,
  },
});
