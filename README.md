# SofizPay SDK

A comprehensive JavaScript SDK for interacting with the Stellar blockchain, specifically designed for DZT token transactions and payments.

## 🚀 Features

- **Send Payments**: Send DZT tokens to any Stellar address
- **Get Transactions**: Fetch all DZT transactions for an account
- **Get Balance**: Check DZT token balance
- **Search Transactions**: Search transactions by memo or transaction hash
- **Real-time Streaming**: Listen to new transactions in real-time
- **Multi-environment Support**: Works in browsers, Node.js, React, Vue, and more

## 📦 Installation

### NPM Installation
```bash
npm install sofizpay-sdk
```

### CDN Usage (Vanilla JS)
```html
<!-- Include Stellar SDK and Axios dependencies -->
<script src="https://unpkg.com/stellar-sdk@12.3.0/dist/stellar-sdk.min.js"></script>
<script src="https://unpkg.com/axios@1.10.0/dist/axios.min.js"></script>

<!-- Include SofizPay SDK -->
<script src="https://unpkg.com/sofizpay-sdk@latest/dist/sofizpay-sdk.umd.js"></script>
```

## 🔧 Quick Start

### Vanilla JavaScript

```html
<!DOCTYPE html>
<html>
<head>
    <title>SofizPay SDK Example</title>
</head>
<body>
    <!-- Include dependencies -->
    <script src="https://unpkg.com/stellar-sdk@12.3.0/dist/stellar-sdk.min.js"></script>
    <script src="https://unpkg.com/axios@1.10.0/dist/axios.min.js"></script>
    <script src="https://unpkg.com/sofizpay-sdk@latest/dist/sofizpay-sdk.umd.js"></script>

    <script>
        // Initialize SDK
        const sdk = new SofizPaySDK();

        // Send a payment
        async function sendPayment() {
            const result = await sdk.submit({
                secretkey: 'YOUR_SECRET_KEY',
                destinationPublicKey: 'DESTINATION_PUBLIC_KEY',
                amount: 100,
                memo: 'Payment for services'
            });

            if (result.success) {
                console.log('Payment sent!', result.transactionHash);
            } else {
                console.error('Payment failed:', result.error);
            }
        }

        // Get account balance
        async function getBalance() {
            const result = await sdk.getDZTBalance('YOUR_SECRET_KEY');
            console.log('DZT Balance:', result.balance);
        }
    </script>
</body>
</html>
```

### Node.js

```javascript
import SofizPaySDK from 'sofizpay-sdk';

const sdk = new SofizPaySDK();

// Send payment
const paymentResult = await sdk.submit({
    secretkey: 'YOUR_SECRET_KEY',
    destinationPublicKey: 'DESTINATION_PUBLIC_KEY',
    amount: 100,
    memo: 'Payment description'
});

console.log(paymentResult);
```

### React

```jsx
import React, { useState, useEffect } from 'react';
import SofizPaySDK from 'sofizpay-sdk';

function PaymentComponent() {
    const [sdk] = useState(new SofizPaySDK());
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);

    useEffect(() => {
        loadBalance();
        loadTransactions();
    }, []);

    const loadBalance = async () => {
        const result = await sdk.getDZTBalance('YOUR_SECRET_KEY');
        if (result.success) {
            setBalance(result.balance);
        }
    };

    const loadTransactions = async () => {
        const result = await sdk.getTransactions('YOUR_SECRET_KEY');
        if (result.success) {
            setTransactions(result.transactions);
        }
    };

    const sendPayment = async () => {
        const result = await sdk.submit({
            secretkey: 'YOUR_SECRET_KEY',
            destinationPublicKey: 'DESTINATION_PUBLIC_KEY',
            amount: 50,
            memo: 'React payment'
        });

        if (result.success) {
            alert('Payment sent successfully!');
            loadBalance(); // Refresh balance
            loadTransactions(); // Refresh transactions
        }
    };

    return (
        <div>
            <h2>DZT Balance: {balance}</h2>
            <button onClick={sendPayment}>Send Payment</button>
            
            <h3>Recent Transactions</h3>
            <ul>
                {transactions.map((tx, index) => (
                    <li key={index}>
                        {tx.amount} DZT - {tx.memo} ({tx.type})
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default PaymentComponent;
```

### Vue.js

```vue
<template>
  <div>
    <h2>DZT Balance: {{ balance }}</h2>
    <button @click="sendPayment">Send Payment</button>
    
    <h3>Transactions</h3>
    <div v-for="tx in transactions" :key="tx.hash">
      {{ tx.amount }} DZT - {{ tx.memo }}
    </div>
  </div>
</template>

<script>
import SofizPaySDK from 'sofizpay-sdk';

export default {
  data() {
    return {
      sdk: new SofizPaySDK(),
      balance: 0,
      transactions: []
    };
  },
  
  async mounted() {
    await this.loadData();
  },
  
  methods: {
    async loadData() {
      const balanceResult = await this.sdk.getDZTBalance('YOUR_SECRET_KEY');
      if (balanceResult.success) {
        this.balance = balanceResult.balance;
      }

      const txResult = await this.sdk.getTransactions('YOUR_SECRET_KEY');
      if (txResult.success) {
        this.transactions = txResult.transactions;
      }
    },
    
    async sendPayment() {
      const result = await this.sdk.submit({
        secretkey: 'YOUR_SECRET_KEY',
        destinationPublicKey: 'DESTINATION_PUBLIC_KEY',
        amount: 25,
        memo: 'Vue.js payment'
      });

      if (result.success) {
        alert('Payment sent!');
        await this.loadData();
      }
    }
  }
};
</script>
```

## 📚 API Reference

### Constructor

```javascript
const sdk = new SofizPaySDK();
```

### Methods

#### `submit(data)`

Send a DZT payment transaction.

**Parameters:**
- `data` (Object):
  - `secretkey` (string): Your Stellar secret key
  - `destinationPublicKey` (string): Recipient's public key
  - `amount` (number): Amount to send
  - `memo` (string): Transaction memo (max 28 characters)
  - `assetCode` (string, optional): Asset code (default: 'DZT')
  - `assetIssuer` (string, optional): Asset issuer

**Returns:** Promise resolving to transaction result

```javascript
const result = await sdk.submit({
    secretkey: 'SXXXXX...',
    destinationPublicKey: 'GXXXXX...',
    amount: 100,
    memo: 'Payment description'
});
```

#### `getTransactions(secretkey, limit)`

Get DZT transactions for an account.

**Parameters:**
- `secretkey` (string): Your Stellar secret key
- `limit` (number, optional): Number of transactions to fetch (default: 50)

**Returns:** Promise resolving to transactions array

```javascript
const result = await sdk.getTransactions('SXXXXX...', 100);
console.log(result.transactions);
```

#### `getDZTBalance(secretkey)`

Get DZT token balance for an account.

**Parameters:**
- `secretkey` (string): Your Stellar secret key

**Returns:** Promise resolving to balance information

```javascript
const result = await sdk.getDZTBalance('SXXXXX...');
console.log('Balance:', result.balance);
```

#### `getPublicKey(secretkey)`

Extract public key from secret key.

**Parameters:**
- `secretkey` (string): Your Stellar secret key

**Returns:** Promise resolving to public key

```javascript
const result = await sdk.getPublicKey('SXXXXX...');
console.log('Public Key:', result.publicKey);
```

#### `searchTransactionsByMemo(secretkey, memo, limit)`

Search transactions by memo text.

**Parameters:**
- `secretkey` (string): Your Stellar secret key
- `memo` (string): Memo text to search for
- `limit` (number, optional): Max results (default: 50)

**Returns:** Promise resolving to matching transactions

```javascript
const result = await sdk.searchTransactionsByMemo('SXXXXX...', 'payment', 10);
console.log('Found transactions:', result.transactions);
```

#### `getTransactionByHash(transactionHash)`

Get transaction details by hash.

**Parameters:**
- `transactionHash` (string): Transaction hash

**Returns:** Promise resolving to transaction details

```javascript
const result = await sdk.getTransactionByHash('abc123...');
if (result.found) {
    console.log('Transaction:', result.transaction);
}
```

#### `startTransactionStream(secretkey, callback)`

Start listening for new transactions in real-time.

**Parameters:**
- `secretkey` (string): Your Stellar secret key
- `callback` (function): Function called when new transaction is received

**Returns:** Promise resolving to stream status

```javascript
const result = await sdk.startTransactionStream('SXXXXX...', (newTransaction) => {
    console.log('New transaction:', newTransaction);
});
```

#### `stopTransactionStream(secretkey)`

Stop the transaction stream.

**Parameters:**
- `secretkey` (string): Your Stellar secret key

**Returns:** Promise resolving to stop status

```javascript
const result = await sdk.stopTransactionStream('SXXXXX...');
```

#### `getStreamStatus(secretkey)`

Check if transaction stream is active.

**Parameters:**
- `secretkey` (string): Your Stellar secret key

**Returns:** Promise resolving to stream status

```javascript
const result = await sdk.getStreamStatus('SXXXXX...');
console.log('Stream active:', result.isActive);
```

#### `getVersion()`

Get SDK version.

**Returns:** Version string

```javascript
const version = sdk.getVersion();
console.log('SDK Version:', version);
```

## 🔐 Security Notes

- **Never expose secret keys**: Always keep secret keys secure and never include them in client-side code in production
- **Use environment variables**: Store sensitive data in environment variables
- **Test network first**: Always test with Stellar testnet before using mainnet

## 🌐 Network Configuration

This SDK is configured for Stellar Mainnet. The DZT token details:
- **Asset Code**: DZT
- **Asset Issuer**: GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV

## 📝 Response Format

All SDK methods return responses in this format:

```javascript
{
    success: true|false,
    // ... method-specific data
    timestamp: "2025-07-15T10:30:00.000Z"
}
```

### Success Response Example:
```javascript
{
    success: true,
    transactionHash: "abc123...",
    amount: 100,
    memo: "Payment description",
    timestamp: "2025-07-15T10:30:00.000Z"
}
```

### Error Response Example:
```javascript
{
    success: false,
    error: "Secret key is required.",
    timestamp: "2025-07-15T10:30:00.000Z"
}
```

## 🛠️ Development

### Building from Source

```bash
git clone https://github.com/your-username/sofizpay-sdk.git
cd sofizpay-sdk
npm install
npm run build
```

### Running Tests

```bash
npm test
```

## 📄 License

MIT License

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For support and questions, please open an issue on GitHub.

---

**Made with ❤️ for the Stellar ecosystem**
