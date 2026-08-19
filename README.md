<div align="center">
  <img src="https://github.com/kenandarabeh/sofizpay-sdk/blob/main/assets/sofizpay-logo.png?raw=true" alt="SofizPay Logo" width="200" />
</div>

# SofizPay SDK JS

**The official JavaScript SDK for secure digital payments, EDAHABIA / CIB transactions, utility bill payments, and telecom recharges in Algeria.**

[![npm version](https://badge.fury.io/js/sofizpay-sdk-js.svg)](https://www.npmjs.com/package/sofizpay-sdk-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🚀 Quick Start

### Installation

```bash
npm install sofizpay-sdk-js
# or
yarn add sofizpay-sdk-js
```

### Basic Usage

```javascript
import SofizPaySDK from 'sofizpay-sdk-js';

// Production mode (default)
const sdk = new SofizPaySDK();

// Or Sandbox mode for testing
// const sdk = new SofizPaySDK(true);

// Send direct wallet payment
const result = await sdk.submit({
  secretkey: 'YOUR_SECRET_KEY',
  destinationPublicKey: 'RECIPIENT_PUBLIC_KEY',
  amount: 100,
  memo: 'Payment description'
});

console.log(result.success ? 'Payment sent!' : result.error);
```

---

## ✨ Features

- 💳 **CIB & EDAHABIA Gateway** - Accept bank card and postal card payments with full 3D Secure & Webhook callbacks.
- 🔍 **CIB Transaction Status Check** - Real-time verification of CIB/EDAHABIA payment status.
- ⚡ **Send Secure Payments** - Instant DZT wallet digital transactions.
- 💰 **Account Balance** - Real-time balance checking.
- 📜 **Transaction History & Search** - Complete transaction history and memo/hash searching.
- 📡 **Real-time Streaming** - Live transaction monitoring with customizable intervals.
- 🛍️ **Products Catalog** - Browse available products, gaming vouchers, and telecom packages.
- 🧾 **Utility Bill Payments** - Pay Sonelgaz, ADE (water), and Algérie Télécom bills programmatically.
- 📱 **Mobile & Internet Top-ups** - Flexy (Mobilis, Djezzy, Ooredoo) and IDOOM (ADSL / 4G LTE).
- 🎮 **Gaming Credits** - Instant top-ups for PUBG UC, Free Fire Diamonds, and more.
- 🔐 **Digital Signature Verification** - Verify cryptographic signatures from SofizPay callbacks.
- 🌐 **Multi-platform** - Works in Node.js, Browsers, React, Vue, React Native, and Next.js.

---

## 📖 API Reference & Examples

### 1. CIB & EDAHABIA Transactions (`makeCIBTransaction`)

Generate a secure payment URL to accept CIB or EDAHABIA payments with 3D Secure support, webhook callbacks, and sandbox testing.

```javascript
const response = await sdk.makeCIBTransaction({
  account: 'GDNS27ISCGOIJFXC6CM4O5SVHVJPSWR42QEBWUFF24N5VVHGW73ZSJNQ', // Your Sofizpay receiving account
  amount: 1500,                                                       // Amount in DZD
  full_name: 'Ahmed Ben Ali',                                          // Customer name
  phone: '+213555123456',                                             // Customer phone
  email: 'ahmed.benali@example.com',                                  // Customer email
  return_url: 'https://mystore.com/payment-callback',                 // Redirect URL after checkout
  webhook_url: 'https://mystore.com/api/cib-webhook',                // Real-time async webhook URL
  invoice_id: 'INV-2026-001',                                         // Optional invoice ID
  language: 'ar',                                                     // 'ar' | 'en' | 'fr'
  memo: 'Order #12345',                                               // Payment note (max 28 bytes)
  redirect: 'yes',                                                    // 'yes' | 'no'
  keep_return_url: 'True',                                            // Include signed callback params
  is_sandbox: false                                                   // Set true for Sandbox testing
});

if (response.success) {
  console.log('Payment URL:', response.payment_url);
  console.log('Transaction ID:', response.transaction_id);
  // Redirect customer to response.payment_url
} else {
  console.error('Failed to initiate payment:', response.error);
}
```

#### Dedicated Sandbox Helper:
```javascript
// Creates a CIB transaction directly in the Sandbox environment
const sandboxRes = await sdk.makeSandboxCIBTransaction({
  account: 'GDNS27ISCGOIJFXC6CM4O5SVHVJPSWR42QEBWUFF24N5VVHGW73ZSJNQ',
  amount: 150.0,
  full_name: 'Sandbox Tester',
  phone: '0661000000',
  email: 'sandbox@sofizpay.com',
  memo: 'Node Sandbox Test'
});
```

---

### 2. Check CIB Transaction Status (`checkCIBTransaction` / `checkCIBStatus`)

Verify the payment status of an order after user completes payment on the SATIM page.

```javascript
// Query by order number / CIB transaction ID
const check = await sdk.checkCIBTransaction({
  order_number: '2517039448',
  is_sandbox: false // Set true if testing in sandbox
});

if (check.success && check.status === 'paid') {
  console.log(`Order ${check.order_number} was successfully paid! Amount: ${check.amount} DZD`);
} else {
  console.log('Payment status:', check.status, check.errorMessage);
}
```

#### Dedicated Status Check Helpers:
```javascript
// Check status in Production
const prodStatus = await sdk.checkCIBStatus('2517039448');

// Check status in Sandbox
const sandboxStatus = await sdk.checkSandboxCIBStatus('40a11881d8764fe9a371');
```

---

### 3. Products Catalog (`getProducts`)

Retrieve available products and services with their prices in DZT, with optional search filtering.

```javascript
// Get all available products
const catalog = await sdk.getProducts({
  encrypted_sk: 'YOUR_ENCRYPTED_SECRET_KEY_OR_PLAIN_KEY'
});

console.log(`Available products count: ${catalog.count}`);
catalog.products.forEach(product => {
  console.log(`${product.name}: ${product.price} DZT`);
});

// Search for specific products (e.g., PUBG, Free Fire, Mobilis)
const searchResult = await sdk.getProducts({
  encrypted_sk: 'YOUR_SECRET_KEY',
  search: 'PUBG'
});
console.log('Found products:', searchResult.products);
```

---

### 4. Utility Bill Payments (`payBill`)

Pay Algerian utility bills directly via the SDK:

#### ADE (Algérienne Des Eaux - Water Bill)
```javascript
const adePayment = await sdk.payAdeBill({
  encrypted_sk: 'YOUR_SECRET_KEY',
  amount: 2500,
  bill: '0123456789' // Bill reference number
});

if (adePayment.success) {
  console.log('ADE Bill Paid! Operation ID:', adePayment.operation_id);
}
```

#### Sonelgaz (Electricity & Gas)
```javascript
const sonelgazPayment = await sdk.paySonelgazBill({
  encrypted_sk: 'YOUR_SECRET_KEY',
  amount: 3500,
  customerId: 'CUST-100234', // Customer ID
  ebb: 'EBB-987654',         // EBB Number
  bill: 'BILL-456789'        // Bill Number
});

if (sonelgazPayment.success) {
  console.log('Sonelgaz Bill Paid! Operation ID:', sonelgazPayment.operation_id);
}
```

#### Algérie Télécom Bill
```javascript
const telecomPayment = await sdk.payAlgerieTelecomBill({
  encrypted_sk: 'YOUR_SECRET_KEY',
  amount: 2000,
  phone: '021234567', // Landline or subscription number
  bill: 'BILL-00129'
});
```

---

### 5. Mobile, Internet & Game Top-ups

#### Phone Recharge (Flexy: Mobilis, Djezzy, Ooredoo)
```javascript
const flexy = await sdk.rechargePhone({
  encrypted_sk: 'YOUR_SECRET_KEY',
  phone: '0661234567',
  operator: 'djezzy', // 'mobilis' | 'djezzy' | 'ooredoo'
  amount: 500,
  offer: 'prepaid'
});
```

#### IDOOM Internet Recharge (ADSL & 4G LTE)
```javascript
const internet = await sdk.rechargeInternet({
  encrypted_sk: 'YOUR_SECRET_KEY',
  phone: '0458230823',          // 10 digits for 4G, 9 digits for ADSL
  operator: 'idoom',
  amount: 1000,
  offer: 'IDOOM 4G 1000'        // e.g. 'IDOOM 4G 1000' or 'IDOOM ADSL 2000'
});
```

#### Gaming Credits (PUBG & Free Fire)
```javascript
const game = await sdk.rechargeGame({
  encrypted_sk: 'YOUR_SECRET_KEY',
  operator: 'pubg',             // 'pubg' | 'freefire'
  playerId: '5123456789',       // Player in-game ID
  amount: 1200,
  offer: '60'                   // '60' | '325' | '660' for PUBG, '110' | '210' for Free Fire
});
```

---

### 6. Operation Details & History

```javascript
// Get details of a specific operation
const details = await sdk.getOperationDetails({
  operation_id: '550e8400-e29b-41d4-a716-446655440000',
  encrypted_sk: 'YOUR_SECRET_KEY'
});

// Get operation history
const history = await sdk.getOperationHistory('YOUR_SECRET_KEY', 10, 0);
console.log('Recent Operations:', history.data);
```

---

### 7. Digital Signature Verification (`verifySignature`)

Verify webhook callbacks signed with RSA SHA-256:

```javascript
// Webhook endpoint in Express
app.post('/api/cib-webhook', (req, res) => {
  const { message, signature_url_safe } = req.body;
  
  const isValid = sdk.verifySignature({
    message: message,
    signature_url_safe: signature_url_safe
  });
  
  if (isValid) {
    // Webhook authentic — fulfill order
    res.status(200).json({ received: true });
  } else {
    res.status(400).json({ error: 'Invalid signature' });
  }
});
```

---

### 8. Direct Stellar Wallet Payments & Balance

```javascript
// Get balance
const balance = await sdk.getBalance('GDNS27ISCGOIJFXC6CM4O5SVHVJPSWR42QEBWUFF24N5VVHGW73ZSJNQ');
console.log('Balance:', balance.balance, balance.asset_code);

// Real-time transaction streaming
const stream = await sdk.startTransactionStream(
  'GDNS27ISCGOIJFXC6CM4O5SVHVJPSWR42QEBWUFF24N5VVHGW73ZSJNQ',
  (newTx) => {
    console.log('Live Payment Received:', newTx.amount, newTx.memo, newTx.from);
  },
  true, // fromNow
  'now',
  30    // check interval in seconds
);

// Stop streaming
await sdk.stopTransactionStream('GDNS27ISCGOIJFXC6CM4O5SVHVJPSWR42QEBWUFF24N5VVHGW73ZSJNQ');
```

---

## 🧪 Testing with CIB Sandbox

SofizPay provides a mock testing environment to test CIB / EDAHABIA payments without real cards:

Set `is_sandbox: true` in `makeCIBTransaction` or `checkCIBTransaction`, or initialize `new SofizPaySDK(true)`.

### Test Card Numbers:

| Card Number | Expiry | CVV | Expected Result |
|-------------|--------|-----|-----------------|
| `6280581001234567` | `12/28` | `123` | **Approved** |
| `6280581009876543` | `12/29` | `456` | **Approved** |
| `6280581005555555` | `06/28` | `999` | **Declined by issuer** |
| `6280581004444444` | `09/28` | `444` | **Insufficient funds** |
| `6280581003333333` | `03/21` | `333` | **Expired card** |
| `6280581002222222` | `11/28` | `222` | **Timeout** |

> **Sandbox OTP:** Use `123456` for any test transaction.

---

## 🔒 Security Best Practices

1. **Protect Secret Keys:** Never hardcode secret keys in frontend or public code. Always use environment variables (`process.env.SOFIZPAY_SECRET_KEY`).
2. **Verify Webhooks:** Always use `sdk.verifySignature()` to validate incoming webhook payloads before updating database records.
3. **Check Status Server-side:** When a customer returns to your `return_url`, verify the transaction using `checkCIBTransaction()` from your server before granting access or fulfilling orders.

---

## 📜 License

MIT © [SofizPay Team](https://github.com/kenandarabeh)

**Built with ❤️ for Algerian Fintech | [docs.sofizpay.com](https://docs.sofizpay.com/)**
