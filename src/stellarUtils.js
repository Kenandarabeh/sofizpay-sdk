import * as StellarSdk from 'stellar-sdk';
import axios from 'axios';

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
export const getBalance = async (publicKey) => {
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
export const getPublicKeyFromSecret = (secretKey) => {
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
export const setupTransactionStream = (publicKey, addTransaction, cursor = 'now', fromNow = true, checkInterval = 30) => {
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

export const sendPayment = async (sourceKey, destinationPublicKey, amount, memo = null) => {
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

export const getTransactions = async (publicKey, limit = 200,cursor = null) => {
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

export const getTransactionByHash = async (transactionHash) => {
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