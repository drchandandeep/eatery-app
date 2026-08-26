// screens/ForgotPasswordScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { colors, spacing, type } from '../theme';
import Button from '../components/Button';
import { api } from '../api/client';
import { showAlert } from '../utils/alert';

export default function ForgotPasswordScreen({ navigation }) {
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState('request'); // 'request' | 'reset'
  const [loading, setLoading] = useState(false);

  async function handleRequest() {
    if (!identifier.trim()) {
      showAlert('Email or phone needed', 'Enter the email or phone number on your account.');
      return;
    }
    setLoading(true);
    try {
      const { message } = await api.requestPasswordReset(identifier.trim());
      showAlert('Check your email', message);
      setStep('reset');
    } catch (err) {
      showAlert('Something went wrong', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (!otp.trim() || !newPassword) {
      showAlert('Missing info', 'Enter the code from your email and a new password.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({ identifier: identifier.trim(), otp: otp.trim(), new_password: newPassword });
      showAlert('Password reset', 'You can now log in with your new password.');
      navigation.goBack();
    } catch (err) {
      showAlert('Could not reset password', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={type.display}>Reset password</Text>
        <Text style={[type.bodyMuted, { marginBottom: spacing(6) }]}>
          {step === 'request'
            ? "We'll email a verification code to your registered address."
            : 'Enter the code we emailed you, along with a new password.'}
        </Text>

        <Text style={styles.label}>Email or phone</Text>
        <TextInput
          style={styles.input}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          editable={step === 'request'}
          placeholder="you@example.com or phone number"
          placeholderTextColor={colors.textMuted}
        />

        {step === 'request' ? (
          <Button title="Send code" onPress={handleRequest} loading={loading} style={{ marginTop: spacing(6) }} />
        ) : (
          <>
            <Text style={[styles.label, { marginTop: spacing(4) }]}>Verification code</Text>
            <TextInput
              style={styles.input}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              placeholder="6-digit code"
              placeholderTextColor={colors.textMuted}
              maxLength={6}
            />
            <Text style={[styles.label, { marginTop: spacing(4) }]}>New password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
            />
            <Button title="Reset password" onPress={handleReset} loading={loading} style={{ marginTop: spacing(6) }} />
            <Button title="Resend code" variant="outline" onPress={handleRequest} style={{ marginTop: spacing(3) }} />
          </>
        )}

        <Button title="Back to login" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: spacing(4) }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(6), paddingTop: spacing(16) },
  label: { ...type.caption, marginBottom: spacing(1.5) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
    color: colors.text,
    fontSize: 15,
  },
});
