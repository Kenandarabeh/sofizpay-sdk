'use strict';

var StellarSdk = require('stellar-sdk');
var axios = require('axios');
var forge = require('node-forge');

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

const setupTransactionStream = (publicKey, addTransaction, fromNow = true, checkInterval = 30) => {
  let streamCloseFunction = null;
  
  const txHandler = async (txResponse) => {
    try {
      const transactionData = await fetchWithRetry(`https://horizon.stellar.org/transactions/${txResponse.id}`);
      const memo = transactionData.memo;
      
      const operationsData = await fetchWithRetry(`https://horizon.stellar.org/transactions/${transactionData.id}/operations`);
      
      const operations = operationsData._embedded.records.filter(operation => {
        return operation.asset_code === 'DZT' && 
               operation.asset_issuer === 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV' &&
               operation.amount;
      });
      
      await Promise.all(operations.map(async (operation) => {
        const newTransaction = {
          id: transactionData.hash,
          memo: memo || '',
          amount: operation.amount || '',
          status: 'completed',
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

  const startStream = () => {
    try {
      
      const streamBuilder = server.transactions()
        .forAccount(publicKey)
        .cursor('now'); 
      
      const eventSource = streamBuilder.stream({
        onmessage: txHandler,
        onerror: async (error) => {
          console.error('Error in transaction stream:', error);
          
          if (error.status === 429) {
            console.warn(`Too many requests, retrying in ${checkInterval} seconds...`);
            await sleep(checkInterval * 1000);
            startStream();
          } else if (error.type === 'close' || error.type === 'error') {
            console.warn(`Stream closed/error, retrying in ${checkInterval} seconds...`);
            await sleep(checkInterval * 1000);
            startStream(); 
          }
        },
        reconnectTimeout: checkInterval * 1000
      });
      
     
      streamCloseFunction = () => {
        if (eventSource && typeof eventSource.close === 'function') {
          eventSource.close();
        }
      };
      
    } catch (error) {
      console.error('Error starting transaction stream:', error);
      setTimeout(() => {
        startStream();
      }, checkInterval * 1000);
    }
  };

  startStream();
  
  return streamCloseFunction;
};
const sendPayment = async (sourceKey, destinationPublicKey, amount, memo = null) => {
  const startTime = Date.now();

  try {
    const sourceKeys = StellarSdk__namespace.Keypair.fromSecret(sourceKey);
    const sourcePublicKey = sourceKeys.publicKey();

    const customAsset = new StellarSdk__namespace.Asset('DZT', 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV');
    const account = await server.loadAccount(sourcePublicKey);

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
      transactionBuilder = transactionBuilder.addMemo(StellarSdk__namespace.Memo.text(memo));
    }

    transactionBuilder = transactionBuilder.setTimeout(60);
    const transaction = transactionBuilder.build();
    
    transaction.sign(sourceKeys);

    const result = await server.submitTransaction(transaction);

    const endTime = Date.now();
    const durationInSeconds = (endTime - startTime) / 1000;

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

    return {
      success: false,
      error: detailedError,
      duration: durationInSeconds,
      rawError: error.response?.data || error
    };
  }
};

const getBalance = async (publicKey) => {
  try {
    const account = await server.loadAccount(publicKey);
    const asset = account.balances.find(balance => 
      balance.asset_code === 'DZT' && 
      balance.asset_issuer === 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV'
    );
    
    return asset ? parseFloat(asset.balance) : 0;
  } catch (error) {
    console.error('Error fetching balance:', error);
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

const getTransactions = async (publicKey, limit = 200) => {
  try {
    const transactions = await server.transactions()
      .forAccount(publicKey)
      .order('desc')
      .limit(limit)
      .call();
    const filteredTransactions = [];
    
    for (const tx of transactions.records) {
      try {
        const operations = await server.operations()
          .forTransaction(tx.id)
          .call();
        for (const op of operations.records) {
          if (op.type === 'payment' && 
              op.asset_code === 'DZT' && 
              op.asset_issuer === 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV') {
            
            filteredTransactions.push({
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
    
    return filteredTransactions;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
};
const getTransactionByHash = async (transactionHash) => {
  if (!transactionHash) {
    throw new Error('Transaction hash is required.');
  }

  try {
    
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

    const targetOperations = formattedTransaction.operations.filter(op => 
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
      has_dzt_operations: targetOperations.length > 0,
      dzt_operations_count: targetOperations.length,
      payment_operations_count: formattedTransaction.operations.length,
      dzt_operations: targetOperations,
      hash: transactionHash,
      message: `Transaction found with ${formattedTransaction.operations.length} payment operations (${targetOperations.length} payments)`
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

module.exports = SofizPaySDK;
