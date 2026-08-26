// screens/ChangePasswordScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { colors, spacing, type } from '../theme';
import Button from '../components/Button';
import { api } from '../api/client';
import { showAlert } from '../utils/alert';

export default function ChangePasswordScreen({ navigation }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSendOtp() {
    setSendingOtp(true);
    try {
      const { message } = await api.requestPasswordChangeOtp();
      showAlert('Code sent', message);
      setOtpSent(true);
    } catch (err) {
      showAlert('Could not send code', err.message);
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !otp.trim()) {
      showAlert('Missing info', 'Fill in your current password, new password, and the code from your email.');
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword, otp: otp.trim() });
      showAlert('Password changed', 'Your password has been updated.');
      navigation.goBack();
    } catch (err) {
      showAlert('Could not change password', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={type.display}>Change password</Text>
        <Text style={[type.bodyMuted, { marginBottom: spacing(6) }]}>
          For your security, this needs a verification code emailed to your registered address.
        </Text>

        <Text style={styles.label}>Current password</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          placeholderTextColor={colors.textMuted}
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

        <Button
          title={otpSent ? 'Resend code' : 'Send verification code to my email'}
          variant="outline"
          onPress={handleSendOtp}
          loading={sendingOtp}
          style={{ marginTop: spacing(5) }}
        />

        {otpSent && (
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
            <Button title="Change password" onPress={handleChangePassword} loading={saving} style={{ marginTop: spacing(6) }} />
          </>
        )}
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
