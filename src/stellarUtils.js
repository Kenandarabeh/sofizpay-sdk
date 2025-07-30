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

export const setupTransactionStream = (publicKey, addTransaction, fromNow = true, checkInterval = 30) => {
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

export const getBalance = async (publicKey) => {
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
export const getPublicKeyFromSecret = (secretKey) => {
  try {
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    return keypair.publicKey();
  } catch (error) {
    console.error('Error extracting public key from secret:', error);
    throw error;
  }
};

export const getTransactions = async (publicKey, limit = 200) => {
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
