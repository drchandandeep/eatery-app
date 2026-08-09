// screens/LoginScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('owner@eatery.app');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      Alert.alert('Login failed', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={type.display}>Welcome back</Text>
        <Text style={[type.bodyMuted, { marginBottom: spacing(6) }]}>Sign in to order your favorites</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
        />

        <Button title="Log in" onPress={handleLogin} loading={loading} style={{ marginTop: spacing(4) }} />

        <Button
          title="Create a customer account"
          variant="outline"
          onPress={() => navigation.navigate('Signup')}
          style={{ marginTop: spacing(3) }}
        />

        <Button
          title="Register your store"
          variant="outline"
          onPress={() => navigation.navigate('StoreRegister')}
          style={{ marginTop: spacing(3) }}
        />

        <Text style={styles.hint}>Demo store-admin login is pre-filled. Customers order for free; stores pay an annual subscription.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing(6) },
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
  hint: { ...type.caption, marginTop: spacing(5), textAlign: 'center' },
});
