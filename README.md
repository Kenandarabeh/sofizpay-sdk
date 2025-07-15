<div align="center">
  <img src="https://github.com/kenandarabeh/sofizpay-sdk/blob/main/assets/sofizpay-logo.png?raw=true" alt="SofizPay Logo" width="200" />
</div>

# SofizPay SDK

**The official JavaScript SDK for DZT payments on Stellar blockchain.**

[![npm version](https://badge.fury.io/js/sofizpay-sdk.svg)](https://www.npmjs.com/package/sofizpay-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Installation

```bash
npm install sofizpay-sdk
```

### Basic Usage

```javascript
import SofizPaySDK from 'sofizpay-sdk';

const sdk = new SofizPaySDK();

// Send payment
const result = await sdk.submit({
  secretkey: 'YOUR_SECRET_KEY',
  destinationPublicKey: 'RECIPIENT_PUBLIC_KEY',
  amount: 100,
  memo: 'Payment description'
});

console.log(result.success ? 'Payment sent!' : result.error);
```

## Features

- ✅ **Send DZT Payments** - Instant blockchain transactions
- ✅ **Get Account Balance** - Real-time DZT balance checking
- ✅ **Transaction History** - Complete transaction records
- ✅ **Search & Filter** - Find transactions by memo or hash
- ✅ **Real-time Streaming** - Live transaction notifications
- ✅ **Multi-platform** - Works everywhere (Browser, Node.js, React, Vue)

## Usage Examples

### Browser (CDN)

```html
<script src="https://unpkg.com/stellar-sdk@12.3.0/dist/stellar-sdk.min.js"></script>
<script src="https://unpkg.com/axios@1.10.0/dist/axios.min.js"></script>
<script src="https://unpkg.com/sofizpay-sdk@latest/dist/sofizpay-sdk.umd.js"></script>

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
import SofizPaySDK from 'sofizpay-sdk';

function WalletComponent() {
  const [sdk] = useState(() => new SofizPaySDK());
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const loadBalance = async () => {
      const result = await sdk.getDZTBalance('YOUR_SECRET_KEY');
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
      <h2>Balance: {balance} DZT</h2>
      <button onClick={sendPayment}>Send Payment</button>
    </div>
  );
}
```

### Node.js

```javascript
import SofizPaySDK from 'sofizpay-sdk';

const sdk = new SofizPaySDK();

async function main() {
  // Check balance
  const balance = await sdk.getDZTBalance('YOUR_SECRET_KEY');
  console.log(`Current balance: ${balance.balance} DZT`);

  // Send payment
  const payment = await sdk.submit({
    secretkey: 'YOUR_SECRET_KEY',
    destinationPublicKey: 'RECIPIENT_KEY',
    amount: 100,
    memo: 'Server payment'
  });

  console.log(payment.success ? 'Payment sent!' : payment.error);
}

main();
```

## API Reference

### Core Methods

| Method | Description | Example |
|--------|-------------|---------|
| `submit(data)` | Send DZT payment | `sdk.submit({secretkey, destinationPublicKey, amount, memo})` |
| `getDZTBalance(secretkey)` | Get account balance | `sdk.getDZTBalance('SXXX...')` |
| `getTransactions(secretkey, limit)` | Get transaction history | `sdk.getTransactions('SXXX...', 50)` |
| `getTransactionByHash(hash)` | Find transaction by hash | `sdk.getTransactionByHash('abc123...')` |
| `searchTransactionsByMemo(secretkey, memo)` | Search by memo | `sdk.searchTransactionsByMemo('SXXX...', 'payment')` |

### Advanced Features

```javascript
// Real-time transaction monitoring
await sdk.startTransactionStream('YOUR_SECRET_KEY', (newTx) => {
  console.log('New transaction received:', newTx);
});

// Stop monitoring
await sdk.stopTransactionStream('YOUR_SECRET_KEY');

// Get public key from secret key
const result = await sdk.getPublicKey('YOUR_SECRET_KEY');
console.log('Public key:', result.publicKey);
```

## Response Format

All methods return a consistent response format:

```javascript
// Success
{
  success: true,
  // ... method-specific data
  timestamp: "2025-07-15T10:30:00.000Z"
}

// Error
{
  success: false,
  error: "Error description",
  timestamp: "2025-07-15T10:30:00.000Z"
}
```

## Configuration

The SDK is pre-configured for Stellar Mainnet with DZT token:

- **Network**: Stellar Mainnet
- **Asset Code**: DZT
- **Asset Issuer**: `GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV`

## Security Best Practices

⚠️ **Important Security Notes:**

- Never expose secret keys in client-side code
- Use environment variables for sensitive data
- Always test on Stellar Testnet first
- Validate all inputs before sending transactions

```javascript
// ✅ Good - Environment variable
const secretKey = process.env.STELLAR_SECRET_KEY;

// ❌ Bad - Hardcoded in code
const secretKey = 'SXXXXXXXXXXXXX...';
```

## Examples Repository

Find complete examples at: [github.com/kenandarabeh/sofizpay-sdk/examples](https://github.com/kenandarabeh/sofizpay-sdk/tree/main/examples)

## Support

- 📚 **Documentation**: [Full API Docs](https://github.com/kenandarabeh/sofizpay-sdk#readme)
- 🐛 **Issues**: [Report Bug](https://github.com/kenandarabeh/sofizpay-sdk/issues)
- 💬 **Discussions**: [Community Help](https://github.com/kenandarabeh/sofizpay-sdk/discussions)

## License

MIT © [SofizPay Team](https://github.com/kenandarabeh)

---

**Built with ❤️ for the Stellar ecosystem | Version `1.0.3`**
