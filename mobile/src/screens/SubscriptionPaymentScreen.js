// screens/SubscriptionPaymentScreen.js
// Store owners don't pay through a payment gateway for their annual
// subscription -- they scan the platform's own UPI QR code, pay manually in
// their own UPI app, then upload a screenshot here as proof. A
// platform_admin reviews it (see PlatformAdminScreen) and only then does
// the subscription actually activate. This screen just handles the upload
// side of that.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, type, radius } from '../theme';
import { api } from '../api/client';
import Button from '../components/Button';
import { showAlert } from '../utils/alert';
import { buildUpiUri, openUpiApp } from '../utils/upi';

const STATUS_LABEL = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected \u2014 please resubmit',
};

export default function SubscriptionPaymentScreen({ navigation }) {
  const [qr, setQr] = useState(null);
  const [loadingQr, setLoadingQr] = useState(true);
  const [requests, setRequests] = useState([]);
  const [screenshot, setScreenshot] = useState(null); // { base64, uri }
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    api.getSubscriptionQr().then(setQr).catch(() => {}).finally(() => setLoadingQr(false));
    api.mySubscriptionRequests().then(({ requests: r }) => setRequests(r)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const [upiAttempted, setUpiAttempted] = useState(false);

  async function handleOpenUpiApp() {
    const uri = buildUpiUri({ upiId: qr?.upi_id, payeeName: 'Kahumbo', amount: qr?.amount, note: 'Annual subscription' });
    const opened = await openUpiApp(uri);
    setUpiAttempted(true);
    if (!opened) {
      showAlert(
        'Could not open a UPI app',
        'No UPI app was detected, or it could not be opened automatically. Please scan the QR code above instead.'
      );
    }
  }

  async function pickScreenshot() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Photo access needed', 'Allow photo library access to upload your payment screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setScreenshot({ uri: asset.uri, base64: asset.base64, mime: asset.mimeType || 'image/jpeg' });
    }
  }

  async function handleSubmit() {
    if (!screenshot?.base64) {
      showAlert('Screenshot needed', 'Upload a screenshot of your completed payment first.');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitSubscriptionProof({
        screenshot_base64: `data:${screenshot.mime};base64,${screenshot.base64}`,
        note: note.trim() || undefined,
      });
      showAlert('Submitted', 'Your payment proof was submitted. We\u2019ll review it shortly and activate your subscription.');
      setScreenshot(null);
      setNote('');
      load();
      navigation.goBack();
    } catch (err) {
      showAlert('Could not submit', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>Pay subscription</Text>
      <Text style={[type.bodyMuted, { marginBottom: spacing(6) }]}>
        Scan the QR below in any UPI app, pay the annual fee, then upload a screenshot as proof.
      </Text>

      <View style={styles.card}>
        {loadingQr ? (
          <ActivityIndicator color={colors.accent} />
        ) : qr?.qr_image_base64 ? (
          <>
            {qr.upi_id && (
              <Button
                title={qr.amount ? `Pay \u20b9${Math.round(qr.amount)} \u2014 Open UPI App` : 'Pay \u2014 Open UPI App'}
                onPress={handleOpenUpiApp}
                style={{ width: '100%', marginBottom: spacing(4) }}
              />
            )}
            <Image source={{ uri: qr.qr_image_base64 }} style={styles.qrImage} resizeMode="contain" />
            {qr.upi_id && <Text style={[type.bodyMuted, { marginTop: spacing(3), textAlign: 'center' }]}>UPI ID: {qr.upi_id}</Text>}
            {qr.upi_id && (
              <Text style={[type.caption, { marginTop: spacing(2), textAlign: 'center' }]}>
                {upiAttempted
                  ? "Once you've completed the payment, upload a screenshot below."
                  : 'Tap the button above to pay directly, or scan this QR instead.'}
              </Text>
            )}
          </>
        ) : (
          <Text style={type.bodyMuted}>
            The payment QR code hasn't been set up yet. Please contact the platform owner.
          </Text>
        )}
      </View>

      <Text style={[styles.label, { marginTop: spacing(6) }]}>Upload payment screenshot</Text>
      {screenshot?.uri && <Image source={{ uri: screenshot.uri }} style={styles.preview} resizeMode="cover" />}
      <Button
        title={screenshot ? 'Choose a different screenshot' : 'Choose screenshot from gallery'}
        variant="outline"
        onPress={pickScreenshot}
        style={{ marginTop: spacing(2) }}
      />

      <Text style={[styles.label, { marginTop: spacing(5) }]}>Note (optional)</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Paid via GPay, ref #1234"
        placeholderTextColor={colors.textMuted}
      />

      <Button
        title="Submit for approval"
        onPress={handleSubmit}
        loading={submitting}
        style={{ marginTop: spacing(6) }}
      />

      {requests.length > 0 && (
        <View style={{ marginTop: spacing(8) }}>
          <Text style={[type.h2, { marginBottom: spacing(2) }]}>Your submissions</Text>
          {requests.map((r) => (
            <View key={r.id} style={styles.requestRow}>
              <Text style={type.body}>{new Date(r.created_at).toDateString()}</Text>
              <Text style={[type.caption, statusColor(r.status)]}>{STATUS_LABEL[r.status] || r.status}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function statusColor(status) {
  if (status === 'approved') return { color: colors.success };
  if (status === 'rejected') return { color: colors.danger };
  return { color: colors.accentSoft };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(5), paddingTop: spacing(14), paddingBottom: spacing(10) },
  label: { ...type.caption, marginBottom: spacing(1.5) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(5),
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  qrImage: { width: 220, height: 220, borderRadius: radius.sm },
  preview: { width: '100%', height: 200, borderRadius: radius.md, marginTop: spacing(2), backgroundColor: colors.surface },
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
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(2.5),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
