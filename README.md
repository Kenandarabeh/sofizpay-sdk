<div align="center">
  <img src="https://github.com/kenandarabeh/sofizpay-sdk/blob/main/assets/sofizpay-logo.png?raw=true" alt="SofizPay Logo" width="200" />
</div>

# SofizPay SDK JS

  <h2>SofizPay JavaScript SDK</h2>
  <p><strong>The official JavaScript/TypeScript SDK for secure digital payments on the SofizPay platform.</strong></p>

  [![npm version](https://badge.fury.io/js/sofizpay-sdk-js.svg)](https://www.npmjs.com/package/sofizpay-sdk)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Node.js](https://img.shields.io/badge/Node.js-16%2B-green.svg)](https://nodejs.org/)
</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Methods](#core-methods)
- [API Reference](#api-reference)
- [Digital Services (Missions)](#digital-services-missions)
- [Bank Integration (CIB)](#bank-integration-cib)
- [Real-time Transaction Streaming](#real-time-transaction-streaming)
- [Webhook Signature Verification](#webhook-signature-verification)
- [Response Format](#response-format)
- [Security Best Practices](#security-best-practices)
- [Use Cases](#use-cases)
- [Support](#support)

---

## 🌟 Overview

The SofizPay JS SDK is a full-featured library for integrating **DZT digital payments** into any JavaScript environment — **Node.js**, **React**, **Vue**, or plain **Browser**. It provides a clean async API for on-chain Stellar payments, exhaustive transaction history, CIB bank deposits, digital service recharges (Missions), and webhook signature verification.

**Key Benefits:**
- ⚡ `async/await` API — no callback hell
- 🌍 Works in Node.js, React, Vue, and browsers (CDN)
- 📊 Exhaustive 24-transaction history (Path Payments, Trustlines, Account Creation)
- 🔴 Real-time transaction streaming with configurable intervals
- 🏦 CIB/Dahabia bank deposit links
- 📱 Phone, Internet & Game recharges (Mission APIs)

---

## 📦 Installation

### npm / yarn

```bash
npm install sofizpay-sdk-js
# or
yarn add sofizpay-sdk-js
```

### Browser (CDN)

```html
<script src="https://unpkg.com/stellar-sdk@12.3.0/dist/stellar-sdk.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js"></script>
<script src="https://unpkg.com/axios@1.10.0/dist/axios.min.js"></script>
<script src="https://unpkg.com/sofizpay-sdk-js@latest/dist/sofizpay-sdk.umd.js"></script>

<script>
const sdk = new SofizPaySDK();

async function sendPayment() {
  const result = await sdk.submit({
    secretkey: 'YOUR_SECRET_KEY',
    destinationPublicKey: 'DESTINATION_KEY',
    amount: 50,
    memo: 'Web payment'
  });
  
  alert(result.success ? 'Success!' : result.error);
}
</script>
```

### React

```jsx
import { useState, useEffect } from 'react';
import SofizPaySDK from 'sofizpay-sdk-js';

function WalletComponent() {
  const [sdk] = useState(() => new SofizPaySDK());
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const loadBalance = async () => {
      const result = await sdk.getBalance('YOUR_PUBLIC_KEY');
      if (result.success) setBalance(result.balance);
    };
    loadBalance();
  }, []);

  const sendPayment = async () => {
    const result = await sdk.submit({
      secretkey: 'YOUR_SECRET_KEY',
      destinationPublicKey: 'RECIPIENT_KEY',
      amount: 25,
      memo: 'React payment'
    });
    
    if (result.success) {
      alert('Payment sent successfully!');
      // Reload balance
    }
  };

  return (
    <div>
      <h2>Balance: {balance}</h2>
      <button onClick={sendPayment}>Send Payment</button>
    </div>
  );
}
```

### Node.js

```javascript
import SofizPaySDK from 'sofizpay-sdk-js';
const sdk = new SofizPaySDK();

// 1. Check DZT balance
const balance = await sdk.getBalance('YOUR_PUBLIC_KEY');
if (balance.success) {
  console.log(`💰 Balance: ${balance.balance} DZT`);
}

// 2. Send a DZT payment
const result = await sdk.submit({
  secretkey:            'YOUR_SECRET_KEY',
  destinationPublicKey: 'RECIPIENT_PUBLIC_KEY',
  amount:               100,
  memo:                 'Invoice #1234'
});

if (result.success) {
  console.log(`✅ Payment sent! TX: ${result.transactionId}`);
} else {
  console.error(`❌ Failed: ${result.error}`);
}
```

---

## 🔧 Core Methods

### `getBalance(publicKey)`

Returns the current **DZT** balance for a given Stellar account.

```javascript
const result = await sdk.getBalance('GCAZI...YOUR_PUBLIC_KEY');

// Response
{
  success:      true,
  balance:      '1500.0000000',
  publicKey:    'GCAZI...',
  asset_code:   'DZT',
  asset_issuer: 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV',
  timestamp:    '2025-07-28T10:30:00.000Z'
}
```

---

### `submit(data)`

Submits a DZT payment to the Stellar network.

```javascript
const result = await sdk.submit({
  secretkey:            'SXXX...YOUR_SECRET',         // 56-char Stellar seed starting with 'S'
  destinationPublicKey: 'GXXX...RECIPIENT',            // Recipient's public key
  amount:               250.50,                        // Amount in DZT
  memo:                 'Order #5567'                  // Optional memo (max 28 chars)
});

// Success Response
{
  success:            true,
  transactionId:      'abc123...hash',
  transactionHash:    'abc123...hash',
  amount:             '250.50',
  memo:               'Order #5567',
  destinationPublicKey: 'GXXX...',
  timestamp:          '2025-07-28T10:30:00.000Z'
}
```

> ⚠️ **Memo Truncation:** Memos longer than 28 characters are automatically truncated.

---

### `getTransactions(publicKey, limit)`

Fetches **exhaustive transaction history** via the Stellar `/operations?join=transactions` endpoint. This ensures that all four operation types are captured.

```javascript
const history = await sdk.getTransactions('YOUR_PUBLIC_KEY', 100);

if (history.success) {
  history.transactions.forEach(tx => {
    console.log(`[${tx.timestamp}] ${tx.type.toUpperCase()} — ${tx.amount} ${tx.asset_code || 'DZT'}`);
  });
}

// Each transaction object:
{
  id:          'transaction_hash',
  hash:        'transaction_hash',
  type:        'sent' | 'received' | 'trustline' | 'account_created',
  amount:      '100.0000000',
  from:        'GXXX...sender',
  to:          'GXXX...recipient',
  asset_code:  'DZT',
  memo:        'Payment memo',
  timestamp:   '2025-07-28T10:30:00.000Z',
  successful:  true
}
```

**Captured transaction types:**

| Type | Description |
|------|-------------|
| `sent` | DZT payment sent from this account |
| `received` | DZT payment received by this account |
| `trustline` | DZT trustline created (account activation) |
| `account_created` | Account creation / initial funding |

---

### `getPublicKey(secretKey)`

Derives the Stellar public key from a secret key without making any network calls.

```javascript
const result = await sdk.getPublicKey('SXXX...YOUR_SECRET_KEY');
if (result.success) {
  window.location.href = result.data.payment_url;
}
```

---

### `searchTransactionsByMemo(publicKey, memo, limit)`

Performs a case-insensitive substring search over a user's recent transactions.

```javascript
const results = await sdk.searchTransactionsByMemo('YOUR_PUBLIC_KEY', 'Order #12345', 10);
if (results.success) {
  console.log(`Found ${results.transactions.length} matching transactions`);
}
```

---

### `getTransactionByHash(hash)`

Fetches a single transaction object by its hash.

```javascript
const tx = await sdk.getTransactionByHash('abc123...hash');
if (tx.success && tx.found) {
  console.log('Amount:', tx.transaction.amount);
} else {
  console.log('Transaction not found');
}
```

---

## 📚 API Reference

### Full Method Table

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `submit(data)` | `{secretkey, destinationPublicKey, amount, memo?}` | `PaymentResult` | Submit DZT payment |
| `getBalance(publicKey)` | `string` | `BalanceResult` | Get DZT balance |
| `getPublicKey(secretKey)` | `string` | `PublicKeyResult` | Derive public key from secret |
| `getTransactions(publicKey, limit?)` | `string, number` | `TransactionsResult` | Full transaction history |
| `getTransactionByHash(hash)` | `string` | `TransactionResult` | Find specific transaction |
| `searchTransactionsByMemo(publicKey, memo, limit?)` | `string, string, number` | `TransactionsResult` | Search by memo |
| `startTransactionStream(publicKey, callback, fromNow?, interval?)` | See streaming section | `StreamResult` | Start real-time monitoring |
| `stopTransactionStream(publicKey)` | `string` | `StreamResult` | Stop monitoring |
| `getStreamStatus(publicKey)` | `string` | `StreamStatusResult` | Check stream status |
| `makeCIBTransaction(data)` | See CIB section | `CIBResult` | Create bank payment link |
| `checkCIBStatus(orderNumber)` | `string` | `ServiceResult` | Check CIB order status |
| `rechargePhone(data)` | `{encrypted_sk, phone, operator, amount, offer}` | `ServiceResult` | Phone recharge |
| `rechargeInternet(data)` | `{encrypted_sk, phone, amount, offer}` | `ServiceResult` | Internet recharge |
| `rechargeGame(data)` | `{encrypted_sk, game, player_id, amount}` | `ServiceResult` | Game top-up |
| `payBill(data)` | `{encrypted_sk, ...}` | `ServiceResult` | Bill payment |
| `getProducts(encSk?)` | `string?` | `ServiceResult` | List available products |
| `getOperationHistory(encSk, limit, offset)` | `string, number, number` | `ServiceResult` | Mission history |
| `getOperationDetails(id, encSk)` | `string, string` | `ServiceResult` | Single operation details |
| `verifySignature(data)` | `{message, signature_url_safe}` | `boolean` | Validate RSA webhook |

---

## 📱 Digital Services (Missions)

Mission APIs let your users spend DZT on real-world digital services. All Mission calls require the user's `encrypted_sk` (not the raw secret key).

### Phone Recharge

```javascript
const result = await sdk.rechargePhone({
  encrypted_sk: 'USER_ENCRYPTED_SECRET_KEY',
  phone:        '0661000000',
  operator:     'Mobilis',  // 'Mobilis' | 'Djezzy' | 'Ooredoo'
  amount:       '100',
  offer:        'Top'       // Offer type from getProducts()
});

if (result.success) {
  console.log('✅ Phone recharged!', result.data);
} else {
  console.error('❌ Recharge failed:', result.error);
}
```

### Internet Recharge (Idoom 4G)

```javascript
const result = await sdk.rechargeInternet({
  encrypted_sk: 'USER_ENCRYPTED_SECRET_KEY',
  phone:        '0661000000',
  amount:       '200',
  offer:        'idoom_1gb'
});
```

### Game Top-up (FreeFire, PUBG)

```javascript
const result = await sdk.rechargeGame({
  encrypted_sk: 'USER_ENCRYPTED_SECRET_KEY',
  game:         'freefire',
  player_id:    '123456789',
  amount:       '500'
});
```

### Bill Payment

```javascript
const result = await sdk.payBill({
  encrypted_sk: 'USER_ENCRYPTED_SECRET_KEY',
  bill_type:    'electricity',
  reference:    'REF123456',
  amount:       '1500'
});
```

### Get Available Products

```javascript
const products = await sdk.getProducts();
if (products.success) {
  console.log('Available services:', products.data);
}
```

### Operation History & Details

```javascript
// Recent operations (paginated)
const history = await sdk.getOperationHistory('USER_ENCRYPTED_SK', 10, 0);
if (history.success) {
  console.log('Last 10 operations:', history.data);
}

// Details of a specific operation
const details = await sdk.getOperationDetails('OPERATION_ID', 'USER_ENCRYPTED_SK');
```

---

## 🏦 Bank Integration (CIB)

Generate a secure Dahabia/CIB bank payment link. The user is redirected to a hosted payment page.

```javascript
const result = await sdk.makeCIBTransaction({
  account:    'YOUR_STELLAR_PUBLIC_KEY',    // Your SofizPay account
  amount:     2500,                          // Amount in DZT
  full_name:  'Ahmed Benali',
  phone:      '0661234567',
  email:      'ahmed@example.com',
  memo:       'Order #789',                  // Optional
  return_url: 'https://yoursite.com/callback', // Optional redirect
  redirect:   'no'                           // 'yes' for auto-redirect
});

if (result.success) {
  // Redirect user to payment page
  window.location.href = result.url;
}
```

### Check CIB Status

```javascript
const status = await sdk.checkCIBStatus('ORDER_NUMBER');
if (status.success) {
  console.log('Payment status:', status.data.status);
}
```

---

## 🔴 Real-time Transaction Streaming

Monitor an account for new incoming/outgoing transactions in real-time using polling.

### `startTransactionStream(publicKey, callback, fromNow?, checkInterval?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `publicKey` | `string` | required | Stellar account to monitor |
| `callback` | `function` | required | Called on each new transaction |
| `fromNow` | `boolean` | `true` | `true`: only future txs; `false`: load history first, then monitor |
| `checkInterval` | `number` | `30` | Polling interval in seconds (5–300) |

```javascript
// Monitor only new transactions (live feed)
await sdk.startTransactionStream(
  'YOUR_PUBLIC_KEY',
  (tx) => {
    console.log(`New ${tx.type}: ${tx.amount} DZT — memo: ${tx.memo}`);
  },
  true,   // fromNow
  15      // check every 15 seconds
);

// Load full history first, then monitor new transactions
await sdk.startTransactionStream(
  'YOUR_PUBLIC_KEY',
  (tx) => {
    if (tx.isHistorical) {
      console.log('Historical:', tx);
    } else {
      console.log('Live:', tx);
    }
  },
  false,  // fromNow = false → load history first
  30
);

// Check stream is active
const status = await sdk.getStreamStatus('YOUR_PUBLIC_KEY');
console.log('Active:', status.isActive);

// Stop monitoring
await sdk.stopTransactionStream('YOUR_PUBLIC_KEY');
```

---

## 🔒 Webhook Signature Verification

SofizPay signs all webhook events with RSA-SHA256. Use `verifySignature()` on your server to confirm authenticity before processing any payment event.

```javascript
// Express.js webhook handler
app.post('/webhook/sofizpay', express.json(), (req, res) => {
  const { message, signature_url_safe } = req.body;

  const isValid = sdk.verifySignature({ message, signature_url_safe });

  if (!isValid) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // ✅ Verified — safely process the event
  console.log('Confirmed payment event:', message);
  res.status(200).json({ status: 'received' });
});
```

## Response Format

## 📤 Response Format

All methods return a uniform object with a `success` flag:

```javascript
// ✅ Success
{
  success:   true,
  // ... method-specific fields
  timestamp: '2025-07-28T10:30:00.000Z'
}

// ❌ Failure
{
  success:   false,
  error:     'Human-readable error description',
  timestamp: '2025-07-28T10:30:00.000Z'
}
```

Always guard with `if (result.success)` before accessing data fields.

---

## 🛡️ Security Best Practices

| Rule | Why |
|------|-----|
| ❌ Never expose secret keys client-side | Frontend code is visible to all users |
| ✅ Use environment variables | `process.env.SECRET_KEY` — never hardcode |
| ✅ Verify webhook signatures | Prevents forged payment notifications |
| ✅ Keep `encrypted_sk` server-side | Protects Mission API access |
| ✅ Use HTTPS only | Ensure all network calls are encrypted |

```javascript
// ✅ Correct — environment variable
const result = await sdk.submit({
  secretkey: process.env.SOFIZPAY_SECRET_KEY,
  ...
});

// ❌ Never do this
const result = await sdk.submit({
  secretkey: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  ...
});
```

---

## 💡 Use Cases

### E-commerce / Online Store

```javascript
// Process a customer's order payment
async function chargeOrder(orderId, customerKey, amount) {
  const result = await sdk.submit({
    secretkey:            process.env.STORE_SECRET_KEY,
    destinationPublicKey: customerKey,
    amount:               amount,
    memo:                 `Order #${orderId}`
  });

  if (result.success) {
    await db.updateOrderStatus(orderId, 'paid', result.transactionHash);
  }

  return result;
}
```

### React Wallet Component

```jsx
import { useState, useEffect } from 'react';
import SofizPaySDK from 'sofizpay-sdk-js';

const sdk = new SofizPaySDK();

export function Wallet({ publicKey }) {
  const [balance, setBalance] = useState('--');

  useEffect(() => {
    sdk.getBalance(publicKey).then(r => {
      if (r.success) setBalance(r.balance);
    });
  }, [publicKey]);

  return (
    <div className="wallet-card">
      <h3>💰 {balance} DZT</h3>
    </div>
  );
}
```

### Real-time Notification System

```javascript
// Alert users when they receive a payment
await sdk.startTransactionStream(userPublicKey, (tx) => {
  if (tx.type === 'received') {
    sendPushNotification(userId, `You received ${tx.amount} DZT!`);
  }
}, true, 10);
```

---

## 📞 Support

- 🌐 **Website**: [SofizPay.com](https://sofizpay.com)
- 📚 **Full Docs**: [GitHub Repository](https://github.com/kenandarabeh/sofizpay-sdk#readme)
- 🐛 **Bug Reports**: [Open an Issue](https://github.com/kenandarabeh/sofizpay-sdk/issues)
- 💬 **Discussions**: [Community Forum](https://github.com/kenandarabeh/sofizpay-sdk/discussions)

---

## License

MIT © [SofizPay Team](https://github.com/kenandarabeh)

---

**Built with ❤️ for JavaScript developers | Version `1.1.11`**
