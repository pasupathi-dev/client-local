// Razorpay Checkout loader + thin wrapper.
// The SDK is loaded from Razorpay's CDN the first time we need it — we
// don't include it in the initial bundle because most users never pay.
//
// `openCheckout(options)` resolves with the Razorpay success payload
// (`razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`) and
// rejects if the user dismisses the modal or payment fails. Callers then
// forward the payload to POST /api/payments/verify on the server.

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

let loadPromise = null

export function loadRazorpay () {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT_URL
    el.async = true
    el.onload  = () => resolve(window.Razorpay)
    el.onerror = () => {
      loadPromise = null            // allow a retry on network error
      reject(new Error('Could not load Razorpay'))
    }
    document.head.appendChild(el)
  })
  return loadPromise
}

// Promisified wrapper around Razorpay Checkout. `options` should carry
// everything except the `handler` / `modal.ondismiss` callbacks — we wire
// those here so the caller can `await` the result.
export async function openCheckout (options) {
  const Razorpay = await loadRazorpay()
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      ...options,
      handler: (resp) => resolve(resp),
      modal: {
        ...(options.modal || {}),
        ondismiss: () => reject(new Error('Payment cancelled')),
      },
    })
    rzp.on('payment.failed', (resp) => {
      const msg = resp?.error?.description || 'Payment failed'
      reject(new Error(msg))
    })
    rzp.open()
  })
}
