import * as StellarSdk from 'stellar-sdk';
import axios from 'axios';
import forge from 'node-forge';

const server = new StellarSdk.Horizon.Server('https://horizon.stellar.org');

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

// دالة للتحقق من صحة الـ public key
const isValidPublicKey = (publicKey) => {
  try {
    StellarSdk.Keypair.fromPublicKey(publicKey);
    return true;
  } catch (error) {
    return false;
  }
};

// دالة محسنة لجلب الرصيد مع معالجة أفضل للأخطاء
const getBalance = async (publicKey) => {
  try {
    // التحقق من صحة الـ public key
    if (!publicKey || typeof publicKey !== 'string') {
      throw new Error('Invalid public key: must be a non-empty string');
    }

    if (!isValidPublicKey(publicKey)) {
      throw new Error('Invalid public key format');
    }

    console.log('Fetching balance for public key:', publicKey);

    // محاولة جلب بيانات الحساب مع إعادة المحاولة
    let account;
    try {
      account = await server.loadAccount(publicKey);
    } catch (error) {
      console.error('Error loading account:', error);
      
      if (error.response && error.response.status === 404) {
        throw new Error('Account not found. The account might not be activated on Stellar network.');
      } else if (error.response && error.response.status === 400) {
        throw new Error('Bad request. Please check if the public key is valid.');
      } else {
        throw new Error(`Failed to load account: ${error.message}`);
      }
    }

    if (!account) {
      throw new Error('Account data is empty');
    }

    if (!account.balances || !Array.isArray(account.balances)) {
      throw new Error('Account balances data is invalid');
    }

    console.log('Account balances:', account.balances);

    // البحث عن رصيد DZT
    const dztAsset = account.balances.find(balance => 
      balance.asset_code === 'DZT' && 
      balance.asset_issuer === 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV'
    );
    
    if (!dztAsset) {
      console.warn('DZT asset not found in account balances');
      return 0;
    }

    const balanceValue = parseFloat(dztAsset.balance);
    
    if (isNaN(balanceValue)) {
      console.warn('Invalid balance value:', dztAsset.balance);
      return 0;
    }

    console.log('DZT balance found:', balanceValue);
    return balanceValue;

  } catch (error) {
    console.error('Error in getBalance:', error);
    throw error;
  }
};

// دالة محسنة لجلب الـ public key من الـ secret key
const getPublicKeyFromSecret = (secretKey) => {
  try {
    if (!secretKey || typeof secretKey !== 'string') {
      throw new Error('Invalid secret key: must be a non-empty string');
    }

    if (!secretKey.startsWith('S') || secretKey.length !== 56) {
      throw new Error('Invalid secret key format. Secret keys should start with S and be 56 characters long.');
    }

    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    const publicKey = keypair.publicKey();
    
    console.log('Generated public key:', publicKey);
    return publicKey;
    
  } catch (error) {
    console.error('Error extracting public key from secret:', error);
    throw new Error(`Failed to extract public key: ${error.message}`);
  }
};

// باقي الدوال بدون تغيير
const setupTransactionStream = (publicKey, addTransaction, cursor = 'now', fromNow = true, checkInterval = 30) => {
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
        .cursor(cursor); // <<-- هنا التغيير الرئيسي      
        
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
    const sourceKeys = StellarSdk.Keypair.fromSecret(sourceKey);
    const sourcePublicKey = sourceKeys.publicKey();

    const customAsset = new StellarSdk.Asset('DZT', 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV');
    const account = await server.loadAccount(sourcePublicKey);

    let transactionBuilder = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: StellarSdk.Networks.PUBLIC
    })
    .addOperation(StellarSdk.Operation.payment({
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
      transactionBuilder = transactionBuilder.addMemo(StellarSdk.Memo.text(memo));
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

const getTransactions = async (publicKey, limit = 200,cursor = null) => {
  try {
    const query = await server.transactions()
      .forAccount(publicKey)
      .order('desc')
      .limit(limit);

    // إذا كان هناك cursor، استخدمه للبدء من تلك النقطة
    if (cursor) {
      query.cursor(cursor);
    }

    const transactions = await query.call();


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
              paging_token: tx.paging_token, // مهم: احصل على الـ token لكل معاملة
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
    this.version = '1.2.0';
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

  async getTransactions(publicKey, limit = 50, cursor = null) {
    if (!publicKey) {
      throw new Error('public Key is required.');
    }

    try {
      const transactions = await getTransactions(publicKey, limit, cursor);
      const formattedTransactions = transactions.map(tx => ({
        id: tx.hash,
        transactionId: tx.hash,
        hash: tx.hash,
        amount: parseFloat(tx.amount),
        memo: tx.memo,
        type: tx.type,
        from: tx.from,
        paging_token: tx.paging_token,
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
      console.log('SDK: Fetching balance for:', publicKey);
      
      const balance = await getBalance(publicKey);
      
      console.log('SDK: Balance result:', balance);
      
      return {
        success: true,
        balance: balance,
        publicKey: publicKey,
        asset_code: 'DZT',
        asset_issuer: 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('SDK: Error fetching balance:', error);
      
      let errorMessage = error.message;
      
      if (error.message.includes('Account not found')) {
        errorMessage = 'Account not found or not activated on Stellar network. Make sure the account has been funded with at least 1 XLM.';
      } else if (error.message.includes('Bad request')) {
        errorMessage = 'Invalid public key format. Please check that you are using a valid Stellar public key.';
      } else if (error.message.includes('Invalid public key')) {
        errorMessage = 'Invalid public key format. Public keys should start with G and be 56 characters long.';
      }
      
      return {
        success: false,
        error: errorMessage,
        balance: 0,
        publicKey: publicKey,
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

  async startTransactionStream(publicKey, onNewTransaction, fromNow = true, cursor = 'now', checkInterval = 30) {
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
          paging_token: newTransaction.paging_token, 
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

      const closeFunction = setupTransactionStream(publicKey, transactionHandler, cursor, checkInterval);      
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

  /**
   * Make a CIB / EDAHABIA payment transaction
   * @param {Object} transactionData - CIB transaction parameters
   * @param {string} transactionData.account - SofizPay account / public key
   * @param {number} transactionData.amount - Payment amount in DZD
   * @param {string} transactionData.full_name - Customer's full name
   * @param {string} transactionData.phone - Customer's phone number
   * @param {string} transactionData.email - Customer's email address
   * @param {string} [transactionData.return_url] - Redirect URL after payment
   * @param {string} [transactionData.webhook_url] - Async webhook notification URL
   * @param {string} [transactionData.invoice_id] - Optional linked invoice ID
   * @param {string} [transactionData.language] - Language for payment gateway ('ar' | 'en' | 'fr')
   * @param {string} [transactionData.memo] - Payment note (truncated to 28 bytes)
   * @param {string} [transactionData.redirect] - 'yes' | 'no'
   * @param {string|boolean} [transactionData.keep_return_url] - 'True' | 'False'
   * @param {boolean} [transactionData.is_sandbox] - Whether to use the Sandbox environment
   * @param {boolean} [transactionData.isSandbox] - Alias for is_sandbox
   */
  async makeCIBTransaction(transactionData) {
    if (!transactionData) {
      throw new Error('Transaction data is required.');
    }
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
      const isSandbox = Boolean(transactionData.is_sandbox || transactionData.isSandbox);
      const baseUrl = isSandbox 
        ? 'https://sofizpay.com/sandbox/make-cib-transaction/' 
        : 'https://sofizpay.com/make-cib-transaction/';
      
      const params = new URLSearchParams();
      
      params.append('account', transactionData.account);
      params.append('amount', transactionData.amount.toString());
      params.append('full_name', transactionData.full_name);
      params.append('phone', transactionData.phone);
      params.append('email', transactionData.email);
      
      if (transactionData.return_url) {
        params.append('return_url', transactionData.return_url);
      }
      if (transactionData.webhook_url) {
        params.append('webhook_url', transactionData.webhook_url);
      }
      if (transactionData.invoice_id) {
        params.append('invoice_id', transactionData.invoice_id);
      }
      if (transactionData.language) {
        params.append('language', transactionData.language);
      }
      if (transactionData.memo) {
        params.append('memo', transactionData.memo);
      }
      if (transactionData.redirect !== undefined) {
        params.append('redirect', typeof transactionData.redirect === 'boolean' 
          ? (transactionData.redirect ? 'yes' : 'no') 
          : transactionData.redirect);
      }
      if (transactionData.keep_return_url !== undefined) {
        params.append('keep_return_url', typeof transactionData.keep_return_url === 'boolean'
          ? (transactionData.keep_return_url ? 'True' : 'False')
          : transactionData.keep_return_url);
      }

      const fullUrl = `${baseUrl}?${params.toString()}`;
      
      const response = await axios.get(fullUrl, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const responseData = response.data;
      const paymentUrl = responseData?.payment_url || responseData?.cib_response?.formUrl || null;

      return {
        success: responseData?.status !== 'error' && responseData?.success !== false,
        data: responseData,
        payment_url: paymentUrl,
        transaction_id: responseData?.transaction_id || null,
        cib_transaction_id: responseData?.cib_transaction_id || null,
        order_id: responseData?.order_id || null,
        webhook_url: responseData?.webhook_url || transactionData.webhook_url || null,
        account: transactionData.account,
        amount: transactionData.amount,
        full_name: transactionData.full_name,
        phone: transactionData.phone,
        email: transactionData.email,
        memo: transactionData.memo,
        is_sandbox: isSandbox,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error making CIB transaction:', error);
      
      let errorMessage = error.message;
      let errorData = null;
      
      if (error.response) {
        errorData = error.response.data;
        errorMessage = `HTTP Error: ${error.response.status} - ${error.response.statusText}`;
        if (error.response.data && (error.response.data.message || error.response.data.error)) {
          errorMessage += ` - ${error.response.data.message || error.response.data.error}`;
        }
      } else if (error.request) {
        errorMessage = 'Network error: No response received from server';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout: Server took too long to respond';
      }
      
      return {
        success: false,
        error: errorMessage,
        errorData: errorData,
        account: transactionData.account,
        amount: transactionData.amount,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check CIB transaction status by order number
   * @param {string|Object} data - Order number string or options object
   * @param {string} [data.order_number] - CIB order number
   * @param {string} [data.orderNumber] - Alias for order_number
   * @param {boolean} [data.is_sandbox] - Use sandbox check endpoint
   * @param {boolean} [data.isSandbox] - Alias for is_sandbox
   */
  async checkCIBTransaction(data) {
    let orderNumber = null;
    let isSandbox = false;

    if (typeof data === 'string') {
      orderNumber = data;
    } else if (data && typeof data === 'object') {
      orderNumber = data.order_number || data.orderNumber || data.order_id || data.orderId;
      isSandbox = Boolean(data.is_sandbox || data.isSandbox);
    }

    if (!orderNumber) {
      throw new Error('Order number is required.');
    }

    try {
      const baseUrl = isSandbox
        ? 'https://sofizpay.com/sandbox/cib-transaction-check/'
        : 'https://sofizpay.com/cib-transaction-check/';

      const response = await axios.get(`${baseUrl}?order_number=${encodeURIComponent(orderNumber)}`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const responseData = response.data;
      const isSuccess = responseData?.errorCode === 0 || responseData?.orderStatus === 2 || responseData?.status === 'success' || responseData?.respCode === '00';

      return {
        success: isSuccess,
        data: responseData,
        order_number: responseData?.order_number || orderNumber,
        orderStatus: responseData?.orderStatus,
        status: isSuccess ? 'paid' : (responseData?.status || 'pending'),
        amount: responseData?.Amount || responseData?.amount || null,
        errorMessage: responseData?.errorMessage || null,
        is_sandbox: isSandbox,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error checking CIB transaction:', error);
      let errorMessage = error.message;
      let errorData = null;

      if (error.response) {
        errorData = error.response.data;
        errorMessage = `HTTP Error: ${error.response.status} - ${error.response.statusText}`;
        if (error.response.data && (error.response.data.error || error.response.data.message)) {
          errorMessage += ` - ${error.response.data.error || error.response.data.message}`;
        }
      }

      return {
        success: false,
        error: errorMessage,
        errorData: errorData,
        order_number: orderNumber,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Alias for checkCIBTransaction
   */
  async cibTransactionCheck(data) {
    return this.checkCIBTransaction(data);
  }

  /**
   * Retrieve catalog of available products and services
   * @param {string|Object} options - Encrypted secret key string or options object
   * @param {string} options.encrypted_sk - Encrypted or plain Stellar secret key (starts with 'S')
   * @param {string} [options.search] - Optional search filter keyword
   */
  async getProducts(options) {
    let encrypted_sk = null;
    let search = null;

    if (typeof options === 'string') {
      encrypted_sk = options;
    } else if (options && typeof options === 'object') {
      encrypted_sk = options.encrypted_sk || options.secretKey || options.secretkey;
      search = options.search || null;
    }

    if (!encrypted_sk) {
      throw new Error('encrypted_sk (or secret key) is required.');
    }

    try {
      const url = 'https://sofizpay.com/services/get_products/';
      const payload = {
        encrypted_sk: encrypted_sk
      };
      if (search) {
        payload.search = search;
      }

      // Supports sending payload in both body & params for server compatibility
      const response = await axios({
        method: 'POST',
        url: url,
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }).catch(async (postError) => {
        // Fallback to GET with params or data if POST fails
        return await axios.get(url, {
          params: payload,
          data: payload,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
      });

      const data = response.data;

      return {
        success: data?.status === 'success' || Array.isArray(data?.products) || Array.isArray(data),
        status: data?.status || 'success',
        count: data?.count || (Array.isArray(data?.products) ? data.products.length : (Array.isArray(data) ? data.length : 0)),
        products: data?.products || (Array.isArray(data) ? data : []),
        raw: data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching products:', error);
      let errorMessage = error.message;

      if (error.response?.data?.message || error.response?.data?.error) {
        errorMessage = error.response.data.message || error.response.data.error;
      }

      return {
        success: false,
        error: errorMessage,
        products: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generic execution of /services/operation_post for bills, recharges, and games
   * @param {Object} operationData
   */
  async executeServiceOperation(operationData) {
    if (!operationData) {
      throw new Error('Operation data is required.');
    }
    if (!operationData.encrypted_sk) {
      throw new Error('encrypted_sk (or secret key) is required.');
    }
    if (!operationData.operator) {
      throw new Error('Operator is required.');
    }
    if (operationData.amount === undefined || operationData.amount <= 0) {
      throw new Error('Valid amount is required.');
    }

    try {
      const url = 'https://sofizpay.com/services/operation_post';
      const response = await axios.post(url, operationData, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const data = response.data;
      const isSuccess = data?.status === 'success' || data?.transaction_status === 'confirmed';

      return {
        success: isSuccess,
        status: data?.status || (isSuccess ? 'success' : 'failed'),
        message: data?.message || null,
        operation_id: data?.operation_id || null,
        transaction_id: data?.transaction_id || null,
        transaction_status: data?.transaction_status || null,
        data: data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error executing service operation:', error);
      let errorMessage = error.message;
      let errorData = null;

      if (error.response) {
        errorData = error.response.data;
        if (error.response.data && (error.response.data.message || error.response.data.error)) {
          errorMessage = error.response.data.message || error.response.data.error;
        } else {
          errorMessage = `HTTP Error: ${error.response.status} - ${error.response.statusText}`;
        }
      }

      return {
        success: false,
        error: errorMessage,
        errorData: errorData,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Pay utility bills (Sonelgaz, ADE, Algérie Télécom)
   * @param {Object} billData - Bill payment details
   * @param {string} billData.encrypted_sk - Encrypted secret key or plain Stellar secret key
   * @param {number} billData.amount - Payment amount in DZD
   * @param {'ade'|'sonelgaz'|'algerie_telecom'} billData.operator - Utility provider
   * @param {string} [billData.offer] - Offer name (defaults to operator name)
   * @param {string} [billData.bill] - Bill number (Required for ADE and Sonelgaz)
   * @param {string} [billData.customerId] - Customer ID (Required for Sonelgaz)
   * @param {string} [billData.ebb] - EBB number (Required for Sonelgaz)
   * @param {string} [billData.phone] - Phone number (For Algérie Télécom)
   */
  async payBill(billData) {
    if (!billData) {
      throw new Error('Bill payment data is required.');
    }

    const operator = (billData.operator || '').toLowerCase();
    const payload = {
      encrypted_sk: billData.encrypted_sk || billData.secretKey || billData.secretkey,
      amount: billData.amount,
      operator: operator,
      offer: billData.offer || operator
    };

    if (operator === 'ade') {
      if (!billData.bill) {
        throw new Error('Bill number ("bill") is required for ADE water bill payment.');
      }
      payload.bill = billData.bill;
    } else if (operator === 'sonelgaz') {
      if (!billData.bill) {
        throw new Error('Bill number ("bill") is required for Sonelgaz bill payment.');
      }
      if (!billData.customerId) {
        throw new Error('Customer ID ("customerId") is required for Sonelgaz bill payment.');
      }
      if (!billData.ebb) {
        throw new Error('EBB number ("ebb") is required for Sonelgaz bill payment.');
      }
      payload.customerId = billData.customerId;
      payload.ebb = billData.ebb;
      payload.bill = billData.bill;
    } else if (operator === 'algerie_telecom' || operator === 'telecom') {
      payload.operator = 'algerie_telecom';
      payload.offer = billData.offer || 'algerie_telecom';
      if (billData.phone) payload.phone = billData.phone;
      if (billData.bill) payload.bill = billData.bill;
    } else {
      // Pass any additional fields
      Object.assign(payload, billData);
    }

    return this.executeServiceOperation(payload);
  }

  /**
   * Helper to pay ADE (Algérienne Des Eaux) water bill
   * @param {Object} data
   * @param {string} data.encrypted_sk - Encrypted or plain secret key
   * @param {number} data.amount - Bill amount
   * @param {string} data.bill - Bill number
   */
  async payAdeBill(data) {
    return this.payBill({
      ...data,
      operator: 'ade',
      offer: 'ade'
    });
  }

  /**
   * Helper to pay Sonelgaz electricity/gas bill
   * @param {Object} data
   * @param {string} data.encrypted_sk - Encrypted or plain secret key
   * @param {number} data.amount - Bill amount
   * @param {string} data.customerId - Customer ID
   * @param {string} data.ebb - EBB number
   * @param {string} data.bill - Bill number
   */
  async paySonelgazBill(data) {
    return this.payBill({
      ...data,
      operator: 'sonelgaz',
      offer: 'sonelgaz'
    });
  }

  /**
   * Helper to pay Algérie Télécom bill
   * @param {Object} data
   * @param {string} data.encrypted_sk - Encrypted or plain secret key
   * @param {number} data.amount - Bill amount
   * @param {string} [data.phone] - Phone number
   * @param {string} [data.bill] - Bill number
   */
  async payAlgerieTelecomBill(data) {
    return this.payBill({
      ...data,
      operator: 'algerie_telecom',
      offer: 'algerie_telecom'
    });
  }

  /**
   * Recharge phone credit (Flexy: Mobilis, Djezzy, Ooredoo)
   * @param {Object} data
   * @param {string} data.encrypted_sk - Encrypted or plain secret key
   * @param {string} data.phone - Phone number (10 digits)
   * @param {'mobilis'|'djezzy'|'ooredoo'} data.operator - Mobile network operator
   * @param {number} data.amount - Flexy amount in DZD
   * @param {string} [data.offer] - 'prepaid' | 'postpaid' (defaults to 'prepaid')
   */
  async rechargePhone(data) {
    if (!data) throw new Error('Phone recharge data is required.');
    if (!data.phone) throw new Error('Phone number is required.');
    return this.executeServiceOperation({
      encrypted_sk: data.encrypted_sk || data.secretKey || data.secretkey,
      phone: data.phone,
      operator: (data.operator || '').toLowerCase(),
      amount: data.amount,
      offer: data.offer || 'prepaid'
    });
  }

  /**
   * Recharge IDOOM Internet (ADSL / 4G LTE)
   * @param {Object} data
   * @param {string} data.encrypted_sk - Encrypted or plain secret key
   * @param {string} data.phone - Subscription / phone number (10 digits for 4G, 9 digits for ADSL)
   * @param {string} [data.operator] - 'idoom' (default)
   * @param {number} data.amount - Recharge amount in DZD
   * @param {string} data.offer - e.g., 'IDOOM 4G 1000' or 'IDOOM ADSL 2000'
   */
  async rechargeInternet(data) {
    if (!data) throw new Error('Internet recharge data is required.');
    if (!data.phone) throw new Error('Phone/subscription number is required.');
    if (!data.offer) throw new Error('Offer name is required (e.g., "IDOOM 4G 1000").');
    return this.executeServiceOperation({
      encrypted_sk: data.encrypted_sk || data.secretKey || data.secretkey,
      phone: data.phone,
      operator: (data.operator || 'idoom').toLowerCase(),
      amount: data.amount,
      offer: data.offer
    });
  }

  /**
   * Purchase gaming credits (PUBG, Free Fire, etc.)
   * @param {Object} data
   * @param {string} data.encrypted_sk - Encrypted or plain secret key
   * @param {'pubg'|'freefire'} data.operator - Game identifier
   * @param {string} data.playerId - Player ID in game
   * @param {number} data.amount - Recharge amount in DZD
   * @param {string} data.offer - Offer code (e.g., "60" for PUBG, "110" for Free Fire)
   */
  async rechargeGame(data) {
    if (!data) throw new Error('Game recharge data is required.');
    if (!data.playerId) throw new Error('Player ID is required.');
    if (!data.offer) throw new Error('Offer is required (e.g. "60" or "110").');
    return this.executeServiceOperation({
      encrypted_sk: data.encrypted_sk || data.secretKey || data.secretkey,
      operator: (data.operator || '').toLowerCase(),
      playerId: data.playerId,
      amount: data.amount,
      offer: data.offer.toString()
    });
  }

  /**
   * Retrieve operation details by operation UUID
   * @param {string|Object} options - Operation UUID or options object
   * @param {string} options.operation_id - Unique UUID of operation
   * @param {string} options.encrypted_sk - Encrypted or plain secret key
   */
  async getOperationDetails(options, secretKeyParam = null) {
    let operation_id = null;
    let encrypted_sk = null;

    if (typeof options === 'string') {
      operation_id = options;
      encrypted_sk = secretKeyParam;
    } else if (options && typeof options === 'object') {
      operation_id = options.operation_id || options.operationId || options.id;
      encrypted_sk = options.encrypted_sk || options.secretKey || options.secretkey || secretKeyParam;
    }

    if (!operation_id) {
      throw new Error('Operation ID is required.');
    }
    if (!encrypted_sk) {
      throw new Error('encrypted_sk is required.');
    }

    try {
      const url = `https://sofizpay.com/operation-details/${operation_id}/?encrypted_sk=${encodeURIComponent(encrypted_sk)}`;
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        data: response.data,
        operation_id: operation_id,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching operation details:', error);
      let errorMessage = error.message;

      if (error.response?.data?.message || error.response?.data?.error) {
        errorMessage = error.response.data.message || error.response.data.error;
      }

      return {
        success: false,
        error: errorMessage,
        operation_id: operation_id,
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

export { SofizPaySDK as default };
