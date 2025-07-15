(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('stellar-sdk'), require('axios')) :
  typeof define === 'function' && define.amd ? define(['exports', 'stellar-sdk', 'axios'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.SofizPaySDK = {}, global.StellarSdk, global.axios));
})(this, (function (exports, StellarSdk, axios) { 'use strict';

  function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
        }
      });
    }
    n.default = e;
    return Object.freeze(n);
  }

  var StellarSdk__namespace = /*#__PURE__*/_interopNamespaceDefault(StellarSdk);

  const server = new StellarSdk__namespace.Horizon.Server('https://horizon.stellar.org');

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios.get(url);
        return response.data;
      } catch (error) {
        if (error.response && error.response.status === 429 && i < retries - 1) {
          console.warn(`Retrying request... (${i + 1}/${retries})`);
          await sleep(delay);
        } else {
          throw error;
        }
      }
    }
  };

  const setupTransactionStream = (publicKey, addTransaction) => {
    const txHandler = async (txResponse) => {
      try {
        const transactionData = await fetchWithRetry(`https://horizon.stellar.org/transactions/${txResponse.id}`);
        const memo = transactionData.memo;
        
        const operationsData = await fetchWithRetry(`https://horizon.stellar.org/transactions/${transactionData.id}/operations`);
        
        const operations = operationsData._embedded.records.filter(operation => {
          return operation.asset_code && operation.amount;
        });
        
        await Promise.all(operations.map(async (operation) => {
          const newTransaction = {
            id: transactionData.hash,
            memo: memo || '',
            amount: operation.amount || '',
            status: 'pending',
            source_account: operation.source_account || '',
            destination: operation.to || operation.destination || '',
            asset_code: operation.asset_code || '',
            asset_issuer: operation.asset_issuer || '',
            created_at: transactionData.created_at || new Date().toISOString(),
            processed_at: new Date().toISOString()
          };

          addTransaction(newTransaction);
        }));
      } catch (error) {
        console.error('Error fetching transaction details:', error);
      }
    };

    server.transactions()
      .forAccount(publicKey)
      .cursor('now')
      .stream({
        onmessage: txHandler,
        onerror: async (error) => {
          console.error('Error in transaction stream:', error);
          if (error.status === 429) {
            console.warn('Too many requests, retrying in 1 minute...');
            await sleep(60000);
            setupTransactionStream(publicKey, addTransaction);
          }
        }
      });
  };
  const sendPayment = async (sourceKey, destinationPublicKey, amount, assetCode = 'DZT', assetIssuer = 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV', memo = null) => {
    console.log('Starting transaction...');
    const startTime = Date.now();

    try {
      const sourceKeys = StellarSdk__namespace.Keypair.fromSecret(sourceKey);
      const sourcePublicKey = sourceKeys.publicKey();
      console.log('Source public key:', sourcePublicKey);

      const customAsset = new StellarSdk__namespace.Asset(assetCode, assetIssuer);
      const account = await server.loadAccount(sourcePublicKey);
      console.log('Account loaded, sequence:', account.sequenceNumber());

      let transactionBuilder = new StellarSdk__namespace.TransactionBuilder(account, {
        fee: StellarSdk__namespace.BASE_FEE,
        networkPassphrase: StellarSdk__namespace.Networks.PUBLIC
      })
      .addOperation(StellarSdk__namespace.Operation.payment({
        destination: destinationPublicKey,
        asset: customAsset,
        amount: amount.toString()
      }));

      if (memo) {
        if (memo.length > 28) {
          const truncatedMemo = memo.substring(0, 28);
          console.warn(`Memo too long (${memo.length} chars), truncated to: ${truncatedMemo}`);
          memo = truncatedMemo;
        }
        console.log('Adding memo:', memo);
        transactionBuilder = transactionBuilder.addMemo(StellarSdk__namespace.Memo.text(memo));
      }

      transactionBuilder = transactionBuilder.setTimeout(60);
      const transaction = transactionBuilder.build();
      console.log('Transaction built, signing...');
      
      transaction.sign(sourceKeys);
      console.log('Transaction signed');

      console.log('Submitting transaction...');
      const result = await server.submitTransaction(transaction);
      console.log('Transaction successful:', result.hash);

      const endTime = Date.now();
      const durationInSeconds = (endTime - startTime) / 1000;
      console.log(`Transaction completed in ${durationInSeconds} seconds`);

      return {
        success: true,
        hash: result.hash,
        duration: durationInSeconds
      };
    } catch (error) {
      console.error('Transaction failed:', error);
      
      let detailedError = error.message;
      
      if (error.response && error.response.data) {
        console.error('Full error response:', error.response.data);
        
        if (error.response.data.extras) {
          console.error('Error extras:', error.response.data.extras);
          
          if (error.response.data.extras.result_codes) {
            console.error('Result codes:', error.response.data.extras.result_codes);
            
            const codes = error.response.data.extras.result_codes;
            if (codes.transaction) {
              detailedError = `Transaction error: ${codes.transaction}`;
            }
            if (codes.operations && codes.operations.length > 0) {
              detailedError += ` | Operation errors: ${codes.operations.join(', ')}`;
            }
          }
          
          if (error.response.data.extras.envelope_xdr) {
            console.error('Transaction XDR:', error.response.data.extras.envelope_xdr);
          }
          
          if (error.response.data.extras.result_xdr) {
            console.error('Result XDR:', error.response.data.extras.result_xdr);
            
            try {
              const resultDecoded = decodeResultXDR(error.response.data.extras.result_xdr);
              console.error('Decoded result:', resultDecoded);
            } catch (decodeError) {
              console.error('Could not decode result XDR:', decodeError);
            }
          }
          
          if (error.response.data.extras.envelope_xdr) {
            try {
              const txDecoded = decodeTransactionXDR(error.response.data.extras.envelope_xdr);
              console.error('Decoded transaction:', txDecoded);
            } catch (decodeError) {
              console.error('Could not decode transaction XDR:', decodeError);
            }
          }
        }
      }

      const endTime = Date.now();
      const durationInSeconds = (endTime - startTime) / 1000;
      console.log(`Transaction failed in ${durationInSeconds} seconds`);

      return {
        success: false,
        error: detailedError,
        duration: durationInSeconds,
        rawError: error.response?.data || error
      };
    }
  };

  const getDZTBalance = async (publicKey) => {
    try {
      const account = await server.loadAccount(publicKey);
      const dztAsset = account.balances.find(balance => 
        balance.asset_code === 'DZT' && 
        balance.asset_issuer === 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV'
      );
      
      return dztAsset ? parseFloat(dztAsset.balance) : 0;
    } catch (error) {
      console.error('Error fetching DZT balance:', error);
      throw error;
    }
  };
  const getPublicKeyFromSecret = (secretKey) => {
    try {
      const keypair = StellarSdk__namespace.Keypair.fromSecret(secretKey);
      return keypair.publicKey();
    } catch (error) {
      console.error('Error extracting public key from secret:', error);
      throw error;
    }
  };

  const getDZTTransactions = async (publicKey, limit = 200) => {
    try {
      const transactions = await server.transactions()
        .forAccount(publicKey)
        .order('desc')
        .limit(limit)
        .call();
      const dztTransactions = [];
      
      for (const tx of transactions.records) {
        try {
          const operations = await server.operations()
            .forTransaction(tx.id)
            .call();
          for (const op of operations.records) {
            if (op.type === 'payment' && 
                op.asset_code === 'DZT' && 
                op.asset_issuer === 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV') {
              
              dztTransactions.push({
                id: tx.id,
                hash: tx.hash,
                created_at: tx.created_at,
                memo: tx.memo || '',
                amount: op.amount,
                from: op.from,
                to: op.to,
                type: op.from === publicKey ? 'sent' : 'received',
                asset_code: op.asset_code,
                asset_issuer: op.asset_issuer
              });
            }
          }
        } catch (opError) {
          console.error('Error fetching operations for transaction:', tx.id, opError);
        }
      }
      
      return dztTransactions;
    } catch (error) {
      console.error('Error fetching DZT transactions:', error);
      throw error;
    }
  };
  const getTransactionByHash = async (transactionHash) => {
    if (!transactionHash) {
      throw new Error('Transaction hash is required.');
    }

    try {
      console.log('Searching for transaction:', transactionHash);
      
      const transactionData = await server.transactions()
        .transaction(transactionHash)
        .call();

      if (!transactionData) {
        return {
          success: false,
          found: false,
          message: 'Transaction not found',
          hash: transactionHash
        };
      }

      const operations = await server.operations()
        .forTransaction(transactionHash)
        .call();
  console.log('Transaction found:', transactionData);
      const formattedTransaction = {
        id: transactionData.id,
        hash: transactionData.hash,
        ledger: transactionData.ledger,
        created_at: transactionData.created_at,
        source_account: transactionData.source_account,
        source_account_sequence: transactionData.source_account_sequence,
        fee_charged: transactionData.fee_charged,
        operation_count: transactionData.operation_count,
        envelope_xdr: transactionData.envelope_xdr,
        result_xdr: transactionData.result_xdr,
        result_meta_xdr: transactionData.result_meta_xdr,
        fee_meta_xdr: transactionData.fee_meta_xdr,
        memo_type: transactionData.memo_type,
        memo: transactionData.memo || '',
        successful: transactionData.successful,
        paging_token: transactionData.paging_token,
        operations: []
      };

      if (operations && operations.records) {
        for (const op of operations.records) {
          if (op.type === 'payment') {
            const operation = {
              id: op.id,
              type: op.type,
              type_i: op.type_i,
              created_at: op.created_at,
              transaction_hash: op.transaction_hash,
              source_account: op.source_account,
              from: op.from,
              to: op.to,
              amount: op.amount,
              asset_type: op.asset_type,
              asset_code: op.asset_code,
              asset_issuer: op.asset_issuer
            };

            formattedTransaction.operations.push(operation);
          }
        }
      }

      const dztOperations = formattedTransaction.operations.filter(op => 
        op.type === 'payment' && 
        op.asset_code === 'DZT' && 
        op.asset_issuer === 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV'
      );

      const primaryPaymentOperation = formattedTransaction.operations.length > 0 ? formattedTransaction.operations[0] : null;
      
      if (primaryPaymentOperation) {
        formattedTransaction.amount = primaryPaymentOperation.amount;
        formattedTransaction.from = primaryPaymentOperation.from;
        formattedTransaction.to = primaryPaymentOperation.to;
        formattedTransaction.asset_code = primaryPaymentOperation.asset_code;
        formattedTransaction.asset_issuer = primaryPaymentOperation.asset_issuer;
        formattedTransaction.operation_type = primaryPaymentOperation.type;
      }

      return {
        success: true,
        found: true,
        transaction: formattedTransaction,
        has_dzt_operations: dztOperations.length > 0,
        dzt_operations_count: dztOperations.length,
        payment_operations_count: formattedTransaction.operations.length,
        dzt_operations: dztOperations,
        hash: transactionHash,
        message: `Transaction found with ${formattedTransaction.operations.length} payment operations (${dztOperations.length} DZT payments)`
      };

    } catch (error) {
      console.error('Error fetching transaction by hash:', error);
      
      if (error.response && error.response.status === 404) {
        return {
          success: false,
          found: false,
          message: 'Transaction not found on Stellar network',
          hash: transactionHash,
          error: 'Transaction does not exist'
        };
      }

      return {
        success: false,
        found: false,
        message: 'Error while searching for transaction',
        hash: transactionHash,
        error: error.message
      };
    }
  };

  class SofizPaySDK {
    constructor() {
      this.version = '1.0.0';
      this.activeStreams = new Map();
      this.transactionCallbacks = new Map();
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
          data.assetCode || 'DZT',
          data.assetIssuer || 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV',
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

    async getTransactions(secretkey,limit = 50) {
      if (!secretkey) {
        throw new Error('Secret key is required.');
      }

      try {
        const publicKey = getPublicKeyFromSecret(secretkey);
        const dztTransactions = await getDZTTransactions(publicKey,limit);
        
        const formattedTransactions = dztTransactions.map(tx => ({
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

    async getDZTBalance(secretkey) {
      if (!secretkey) {
        throw new Error('Secret key is required.');
      }

      try {
        const publicKey = getPublicKeyFromSecret(secretkey);
        
        const balance = await getDZTBalance(publicKey);
        
        return {
          success: true,
          balance: balance,
          publicKey: publicKey,
          asset_code: 'DZT',
          asset_issuer: 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV',
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('Error fetching DZT balance:', error);
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

    async startTransactionStream(secretkey, onNewTransaction) {
      if (!secretkey) {
        throw new Error('Secret key is required.');
      }
      if (!onNewTransaction || typeof onNewTransaction !== 'function') {
        throw new Error('Callback function is required.');
      }

      try {
        const publicKey = getPublicKeyFromSecret(secretkey);
        
        if (this.activeStreams.has(publicKey)) {
          return {
            success: false,
            error: 'Transaction stream already active for this account',
            publicKey: publicKey
          };
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
            processed_at: newTransaction.processed_at
          };

          onNewTransaction(formattedTransaction);
        };

        setupTransactionStream(publicKey, transactionHandler);
        
        this.activeStreams.set(publicKey, {
          secretkey: secretkey,
          startTime: new Date().toISOString(),
          isActive: true
        });
        
        this.transactionCallbacks.set(publicKey, onNewTransaction);

        return {
          success: true,
          message: 'Transaction stream started successfully',
          publicKey: publicKey,
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

    async stopTransactionStream(secretkey) {
      if (!secretkey) {
        throw new Error('Secret key is required.');
      }

      try {
        const publicKey = getPublicKeyFromSecret(secretkey);
        
        if (!this.activeStreams.has(publicKey)) {
          return {
            success: false,
            error: 'No active transaction stream found for this account',
            publicKey: publicKey
          };
        }

        this.activeStreams.delete(publicKey);
        this.transactionCallbacks.delete(publicKey);

        return {
          success: true,
          message: 'Transaction stream stopped successfully',
          publicKey: publicKey,
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

    async getStreamStatus(secretkey) {
      if (!secretkey) {
        throw new Error('Secret key is required.');
      }

      try {
        const publicKey = getPublicKeyFromSecret(secretkey);
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

    async searchTransactionsByMemo(secretkey, memo, limit = 50) {
      if (!secretkey) {
        throw new Error('Secret key is required.');
      }
      if (!memo) {
        throw new Error('Memo is required for search.');
      }

      try {
        const publicKey = getPublicKeyFromSecret(secretkey);
        
        const dztTransactions = await getDZTTransactions(publicKey, 200);
        
        if (!dztTransactions || !Array.isArray(dztTransactions)) {
          return {
            success: true,
            transactions: [],
            total: 0,
            totalFound: 0,
            searchMemo: memo,
            publicKey: publicKey,
            message: `No transactions found in this account`,
            timestamp: new Date().toISOString()
          };
        }
        
        const filteredTransactions = dztTransactions.filter(tx => {
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
              asset_code: tx.asset_code || 'DZT',
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
            has_dzt_operations: result.has_dzt_operations,
            dzt_operations_count: result.dzt_operations_count,
            dzt_operations: result.dzt_operations,
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
  }

  exports.SofizPaySDK = SofizPaySDK;
  exports.default = SofizPaySDK;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
