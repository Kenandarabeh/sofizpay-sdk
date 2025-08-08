import { sendPayment, getTransactions, getPublicKeyFromSecret, getBalance, setupTransactionStream, getTransactionByHash } from './stellarUtils.js';
import axios from 'axios';
import forge from 'node-forge';

class SofizPaySDK {
  constructor() {
    this.version = '1.1.8';
    this.activeStreams = new Map();
    this.transactionCallbacks = new Map();
    this.streamCloseFunctions = new Map(); 
  }
  
  async submit(data) {
    if (!data.secretkey) {
      throw new Error('Secret key is required.');
    }
    if (!data.destinationPublicKey) {
      throw new Error('Destination public key is required.');
    }
    if (!data.amount || data.amount <= 0) {
      throw new Error('Valid amount is required.');
    }
    if (!data.memo) {
      throw new Error('Memo is required.');
    }
    
    try {
      const result = await sendPayment(
        data.secretkey,
        data.destinationPublicKey,
        data.amount,
        data.memo
      );

      if (result.success) {
        return {
          success: true,
          transactionId: result.hash,
          transactionHash: result.hash,
          amount: data.amount,
          memo: data.memo,
          destinationPublicKey: data.destinationPublicKey,
          duration: result.duration,
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error(result.error || 'Transaction failed');
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getTransactions(publicKey,limit = 50) {
    if (!publicKey) {
      throw new Error('public Key is required.');
    }

    try {

      const transactions = await getTransactions(publicKey,limit);
      
      const formattedTransactions = transactions.map(tx => ({
        id: tx.hash,
        transactionId: tx.hash,
        hash: tx.hash,
        amount: parseFloat(tx.amount),
        memo: tx.memo,
        type: tx.type,
        from: tx.from,
        to: tx.to,
        asset_code: tx.asset_code,
        asset_issuer: tx.asset_issuer,
        status: 'completed',
        timestamp: tx.created_at,
        created_at: tx.created_at
      }));

      return {
        success: true,
        transactions: formattedTransactions,
        total: formattedTransactions.length,
        publicKey: publicKey,
        message: `Fetched all transactions (${formattedTransactions.length} transactions)`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return {
        success: false,
        error: error.message,
        transactions: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  async getBalance(publicKey) {
    if (!publicKey) {
      throw new Error('Public key is required.');
    }

    try {
      
      const balance = await getBalance(publicKey);
      
      return {
        success: true,
        balance: balance,
        publicKey: publicKey,
        asset_code: 'DZT',
        asset_issuer: 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching balance:', error);
      return {
        success: false,
        error: error.message,
        balance: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getPublicKey(secretkey) {
    if (!secretkey) {
      throw new Error('Secret key is required.');
    }

    try {
      const publicKey = getPublicKeyFromSecret(secretkey);
      return {
        success: true,
        publicKey: publicKey,
        secretKey: secretkey,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error extracting public key:', error);
      return {
        success: false,
        error: error.message,
        publicKey: null,
        timestamp: new Date().toISOString()
      };
    }
  }

  async startTransactionStream(publicKey, onNewTransaction, fromNow = true, checkInterval = 30) {
    if (!publicKey) {
      throw new Error('public Key is required.');
    }
    if (!onNewTransaction || typeof onNewTransaction !== 'function') {
      throw new Error('Callback function is required.');
    }
    if (checkInterval < 5 || checkInterval > 300) {
      throw new Error('Check interval must be between 5 and 300 seconds.');
    }

    try {
      
      if (this.activeStreams.has(publicKey)) {
        return {
          success: false,
          error: 'Transaction stream already active for this account',
          publicKey: publicKey
        };
      }

      if (!fromNow) {
        try {
          const previousTransactions = await getTransactions(publicKey, 200);
          
          if (previousTransactions && previousTransactions.length > 0) {
            for (const tx of previousTransactions.reverse()) { 
              const formattedTransaction = {
                id: tx.hash,
                transactionId: tx.hash,
                hash: tx.hash,
                amount: parseFloat(tx.amount),
                memo: tx.memo,
                type: tx.type,
                from: tx.from,
                to: tx.to,
                asset_code: tx.asset_code,
                asset_issuer: tx.asset_issuer,
                status: 'completed',
                timestamp: tx.created_at,
                created_at: tx.created_at,
                processed_at: tx.created_at,
                isHistorical: true 
              };
              
              onNewTransaction(formattedTransaction);
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            onNewTransaction({
              id: 'HISTORY_COMPLETE',
              isHistoryComplete: true,
              historicalCount: previousTransactions.length,
              message: `Loaded ${previousTransactions.length} historical transactions, now listening for new transactions...`
            });
          }
          
        } catch (error) {
          console.warn('Could not load previous transactions:', error);
        }
      }

      const transactionHandler = (newTransaction) => {
        const formattedTransaction = {
          id: newTransaction.id,
          transactionId: newTransaction.id,
          hash: newTransaction.id,
          amount: parseFloat(newTransaction.amount),
          memo: newTransaction.memo,
          type: newTransaction.destination === publicKey ? 'received' : 'sent',
          from: newTransaction.source_account,
          to: newTransaction.destination,
          asset_code: newTransaction.asset_code,
          asset_issuer: newTransaction.asset_issuer,
          status: newTransaction.status,
          timestamp: newTransaction.created_at,
          created_at: newTransaction.created_at,
          processed_at: newTransaction.processed_at,
          isHistorical: false 
        };

        onNewTransaction(formattedTransaction);
      };

      const closeFunction = setupTransactionStream(publicKey, transactionHandler, fromNow, checkInterval);
      
      if (closeFunction && typeof closeFunction === 'function') {
        this.streamCloseFunctions.set(publicKey, closeFunction);
      }
      
      this.activeStreams.set(publicKey, {
        publicKey: publicKey,
        startTime: new Date().toISOString(),
        isActive: true,
        fromNow: fromNow,
        checkInterval: checkInterval
      });
      
      this.transactionCallbacks.set(publicKey, onNewTransaction);

      return {
        success: true,
        message: `Transaction stream started successfully (${fromNow ? 'from now' : 'with history'}, checking every ${checkInterval}s)`,
        publicKey: publicKey,
        fromNow: fromNow,
        checkInterval: checkInterval,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error starting transaction stream:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async stopTransactionStream(publicKey) {
    if (!publicKey) {
      throw new Error('public Key is required.');
    }

    try {
      
      if (!this.activeStreams.has(publicKey)) {
        return {
          success: false,
          error: 'No active transaction stream found for this account',
          publicKey: publicKey
        };
      }

      const streamInfo = this.activeStreams.get(publicKey);

      if (this.streamCloseFunctions && this.streamCloseFunctions.has(publicKey)) {
        const closeFunction = this.streamCloseFunctions.get(publicKey);
        if (typeof closeFunction === 'function') {
          closeFunction();
        }
        this.streamCloseFunctions.delete(publicKey);
      }

      this.activeStreams.delete(publicKey);
      this.transactionCallbacks.delete(publicKey);

      return {
        success: true,
        message: 'Transaction stream stopped successfully',
        publicKey: publicKey,
        streamInfo: streamInfo,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error stopping transaction stream:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getStreamStatus(publicKey) {
    if (!publicKey) {
      throw new Error('public Key is required.');
    }

    try {
      const streamInfo = this.activeStreams.get(publicKey);
      
      return {
        success: true,
        isActive: !!streamInfo,
        publicKey: publicKey,
        streamInfo: streamInfo || null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        isActive: false,
        timestamp: new Date().toISOString()
      };
    }
  }

  getVersion() {
    return this.version;
  }

  async searchTransactionsByMemo(publicKey, memo, limit = 50) {
    if (!publicKey) {
      throw new Error('public Key is required.');
    }
    if (!memo) {
      throw new Error('Memo is required for search.');
    }

    try {
      
      const transactions = await getTransactions(publicKey, 200);
      
      if (!transactions || !Array.isArray(transactions)) {
        return {
          success: true,
          transactions: [],
          total: 0,
          totalFound: 0,
          searchMemo: memo,
          publicKey: publicKey,
          message: `There are no transactions in this account`,
          timestamp: new Date().toISOString()
        };
      }
      
      const filteredTransactions = transactions.filter(tx => {
        if (!tx || !tx.memo) return false;
        
        try {
          return tx.memo.toLowerCase().includes(memo.toLowerCase());
        } catch (error) {
          console.warn('Error filtering transaction:', tx, error);
          return false;
        }
      });
      
      const limitedTransactions = filteredTransactions.slice(0, limit);
      
      const formattedTransactions = limitedTransactions.map(tx => {
        try {
          return {
            id: tx.hash || tx.id || 'unknown',
            transactionId: tx.hash || tx.id || 'unknown',
            hash: tx.hash || tx.id || 'unknown',
            amount: parseFloat(tx.amount) || 0,
            memo: tx.memo || '',
            type: tx.type || 'unknown', 
            from: tx.from || 'unknown',
            to: tx.to || 'unknown',
            asset_code: tx.asset_code || '',
            asset_issuer: tx.asset_issuer || '',
            status: 'completed',
            timestamp: tx.created_at || new Date().toISOString(),
            created_at: tx.created_at || new Date().toISOString()
          };
        } catch (error) {
          console.warn('Error formatting transaction:', tx, error);
          return null;
        }
      }).filter(tx => tx !== null);

      return {
        success: true,
        transactions: formattedTransactions,
        total: formattedTransactions.length,
        totalFound: filteredTransactions.length,
        searchMemo: memo,
        publicKey: publicKey,
        message: `Found ${filteredTransactions.length} transactions containing "${memo}"`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error searching transactions by memo:', error);
      return {
        success: false,
        error: error.message,
        transactions: [],
        searchMemo: memo,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getTransactionByHash(transactionHash) {
    if (!transactionHash) {
      throw new Error('Transaction hash is required.');
    }

    try {
      const result = await getTransactionByHash(transactionHash);
      
      if (result.success && result.found) {
        return {
          success: true,
          found: true,
          transaction: result.transaction,
          has_operations: result.has_dzt_operations,
          operations_count: result.dzt_operations_count,
          operations: result.dzt_operations,
          hash: transactionHash,
          message: result.message,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          success: true,
          found: false,
          transaction: null,
          hash: transactionHash,
          message: result.message || 'Transaction not found',
          error: result.error,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('Error searching for transaction by hash:', error);
      return {
        success: false,
        found: false,
        transaction: null,
        hash: transactionHash,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async makeCIBTransaction(transactionData) {
    if (!transactionData.account) {
      throw new Error('Account is required.');
    }
    if (!transactionData.amount || transactionData.amount <= 0) {
      throw new Error('Valid amount is required.');
    }
    if (!transactionData.full_name) {
      throw new Error('Full name is required.');
    }
    if (!transactionData.phone) {
      throw new Error('Phone number is required.');
    }
    if (!transactionData.email) {
      throw new Error('Email is required.');
    }

    try {
      const baseUrl = 'https:www.sofizpay.com/make-cib-transaction/';
      const params = new URLSearchParams();
      
      params.append('account', transactionData.account);
      params.append('amount', transactionData.amount.toString());
      params.append('full_name', transactionData.full_name);
      params.append('phone', transactionData.phone);
      params.append('email', transactionData.email);
      
      if (transactionData.return_url) {
        params.append('return_url', transactionData.return_url);
      }
      if (transactionData.memo) {
        params.append('memo', transactionData.memo);
      }
      if (transactionData.redirect !== undefined) {
        params.append('redirect', transactionData.redirect);
      }

      const fullUrl = `${baseUrl}?${params.toString()}`;
      
      const response = await axios.get(fullUrl, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error making CIB transaction:', error);
      
      let errorMessage = error.message;
      
      if (error.response) {
        errorMessage = `HTTP Error: ${error.response.status} - ${error.response.statusText}`;
        if (error.response.data && error.response.data.error) {
          errorMessage += ` - ${error.response.data.error}`;
        }
      } else if (error.request) {
        errorMessage = 'Network error: No response received from server';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout: Server took too long to respond';
      }
      
      return {
        success: false,
        error: errorMessage,
        account: transactionData.account,
        amount: transactionData.amount,
        timestamp: new Date().toISOString()
      };
    }
  }

verifySignature(verificationData) {
    if (!verificationData.message) {
      return false;
    }
    if (!verificationData.signature_url_safe) {
      return false;
    }

    const publicKeyPem = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1N+bDPxpqeB9QB0affr/
02aeRXAAnqHuLrgiUlVNdXtF7t+2w8pnEg+m9RRlc+4YEY6UyKTUjVe6k7v2p8Jj
UItk/fMNOEg/zY222EbqsKZ2mF4hzqgyJ3QHPXjZEEqABkbcYVv4ZyV2Wq0x0ykI
+Hy/5YWKeah4RP2uEML1FlXGpuacnMXpW6n36dne3fUN+OzILGefeRpmpnSGO5+i
JmpF2mRdKL3hs9WgaLSg6uQyrQuJA9xqcCpUmpNbIGYXN9QZxjdyRGnxivTE8awx
THV3WRcKrP2krz3ruRGF6yP6PVHEuPc0YDLsYjV5uhfs7JtIksNKhRRAQ16bAsj/
9wIDAQAB
-----END PUBLIC KEY-----`;

    try {
      let base64 = verificationData.signature_url_safe
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      
      while (base64.length % 4) {
        base64 += '=';
      }
      
      const signatureBytes = forge.util.decode64(base64);
      
      const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
      
      const md = forge.md.sha256.create();
      md.update(verificationData.message, 'utf8');
      
      return publicKey.verify(md.digest().bytes(), signatureBytes);
      
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }
}

export default SofizPaySDK;
