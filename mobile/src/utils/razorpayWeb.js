// utils/razorpayWeb.js
// Only used when Platform.OS === 'web'. On native, RazorpayWebViewCheckout
// handles this instead via react-native-webview (which has no web support).
export function openRazorpayWeb(options) {
  return new Promise((resolve, reject) => {
    function launch() {
      const rzp = new window.Razorpay({
        ...options,
        handler: (response) => resolve(response),
        modal: { ondismiss: () => reject(new Error('Payment was cancelled')) },
      });
      rzp.on('payment.failed', (response) => {
        reject(new Error(response?.error?.description || 'Payment failed'));
      });
      rzp.open();
    }

    if (window.Razorpay) {
      launch();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = launch;
    script.onerror = () => reject(new Error('Could not load the payment SDK. Check your internet connection.'));
    document.body.appendChild(script);
  });
}
