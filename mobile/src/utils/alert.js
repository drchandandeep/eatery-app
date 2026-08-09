// utils/alert.js
// React Native's Alert.alert(...) has no effect on web -- it's simply not
// implemented for that platform, so calling it there fails silently (no
// popup, no console error, nothing). This wraps it so error/info messages
// actually show up regardless of platform.
import { Platform, Alert } from 'react-native';

export function showAlert(title, message) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}
