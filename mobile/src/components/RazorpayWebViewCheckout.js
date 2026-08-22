// components/RazorpayWebViewCheckout.js
import React from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme';

function buildCheckoutHtml(options) {
  const payload = JSON.stringify(options);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  </head>
  <body style="margin:0;background:${colors.bg};">
    <script>
      var options = ${payload};
      options.handler = function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          status: 'success',
          payload: {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          }
        }));
      };
      options.modal = {
        ondismiss: function () {
          window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'cancelled', payload: {} }));
        }
      };
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'failed', payload: response.error }));
      });
      rzp.open();
    </script>
  </body>
</html>`;
}

// Controlled component: render with visible + options, handle the three
// outcome callbacks. Renders nothing when not visible.
export default function RazorpayWebViewCheckout({ visible, options, onSuccess, onFailure, onCancel }) {
  if (!visible || !options) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <WebView
          originWhitelist={['*']}
          source={{ html: buildCheckoutHtml(options) }}
          onMessage={(event) => {
            let data;
            try {
              data = JSON.parse(event.nativeEvent.data);
            } catch (e) {
              onFailure({ description: 'Could not read the payment result' });
              return;
            }
            if (data.status === 'success') onSuccess(data.payload);
            else if (data.status === 'cancelled') onCancel();
            else onFailure(data.payload);
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
