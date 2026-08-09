// screens/StoreRegisterScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert } from 'react-native';
import * as Location from 'expo-location';
import { colors, spacing, type, radius } from '../theme';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';

export default function StoreRegisterScreen({ navigation }) {
  const { registerStore } = useAuth();
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCaptureLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Allow location access from inside the store to set its permanent location.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (err) {
      Alert.alert('Could not get location', err.message);
    } finally {
      setLocating(false);
    }
  }

  async function handleRegister() {
    if (!ownerName || !ownerEmail || !ownerPassword || !storeName || !addressLine) {
      Alert.alert('Missing info', 'Owner name, email, password, store name and address are required.');
      return;
    }
    if (!coords) {
      Alert.alert('Store location needed', 'Tap "Use my current location" while at the store.');
      return;
    }
    setLoading(true);
    try {
      await registerStore({
        owner_name: ownerName.trim(),
        owner_email: ownerEmail.trim(),
        owner_phone: ownerPhone.trim(),
        owner_password: ownerPassword,
        store_name: storeName.trim(),
        address_line: addressLine.trim(),
        city: city.trim(),
        zip: zip.trim(),
        lat: coords.lat,
        lng: coords.lng,
      });
      Alert.alert(
        'Store registered',
        'One last step: activate your annual subscription from the admin dashboard so customers can start ordering.'
      );
    } catch (err) {
      Alert.alert('Registration failed', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>Register your store</Text>
      <Text style={[type.bodyMuted, { marginBottom: spacing(6) }]}>
        Billed annually. Your customers always order for free.
      </Text>

      <Text style={styles.section}>Owner account</Text>
      {[
        { label: 'Your name', value: ownerName, set: setOwnerName, kb: 'default' },
        { label: 'Email', value: ownerEmail, set: setOwnerEmail, kb: 'email-address' },
        { label: 'Phone (optional)', value: ownerPhone, set: setOwnerPhone, kb: 'phone-pad' },
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
        value={ownerPassword}
        onChangeText={setOwnerPassword}
        secureTextEntry
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.section}>Store details</Text>
      <Text style={styles.label}>Store name</Text>
      <TextInput style={styles.input} value={storeName} onChangeText={setStoreName} placeholderTextColor={colors.textMuted} />

      <Text style={styles.label}>Store address</Text>
      <TextInput style={styles.input} value={addressLine} onChangeText={setAddressLine} placeholder="Street address" placeholderTextColor={colors.textMuted} />
      <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(2) }}>
        <TextInput style={[styles.input, { flex: 1 }]} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.textMuted} />
        <TextInput style={[styles.input, { flex: 1 }]} value={zip} onChangeText={setZip} placeholder="ZIP" placeholderTextColor={colors.textMuted} />
      </View>

      <Text style={[type.caption, { marginTop: spacing(4) }]}>
        Important: once submitted, your account email and store address are permanent and can't be
        changed. This keeps one subscription tied to one physical store -- if you're opening
        another location, it needs its own email and its own subscription.
      </Text>
      <Button
        title={coords ? 'Location captured \u2713' : locating ? 'Getting location...' : 'Use my current location'}
        variant="outline"
        onPress={handleCaptureLocation}
        loading={locating}
        style={{ marginTop: spacing(3) }}
      />

      <Button title="Register store" onPress={handleRegister} loading={loading} style={{ marginTop: spacing(6) }} />
      <Button title="Back to login" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: spacing(3) }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing(6), paddingVertical: spacing(10) },
  section: { ...type.h2, marginTop: spacing(5), marginBottom: spacing(1) },
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
});
