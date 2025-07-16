export interface SubmitData {
  secretkey: string;
  destinationPublicKey: string;
  amount: number;
  memo: string;
  assetCode?: string;
  assetIssuer?: string;
}

export interface TransactionResult {
  success: boolean;
  transactionId: string;
  transactionHash: string;
  amount: number;
  memo: string;
  destinationPublicKey: string;
  duration: number;
  timestamp: string;
  error?: string;
}

export interface Transaction {
  id: string;
  transactionId: string;
  hash: string;
  amount: number;
  memo: string;
  type: 'sent' | 'received';
  from: string;
  to: string;
  asset_code: string;
  asset_issuer: string;
  status: string;
  timestamp: string;
  created_at: string;
}

export interface TransactionsResult {
  success: boolean;
  transactions: Transaction[];
  total: number;
  totalFound?: number;
  searchMemo?: string;
  publicKey: string;
  message?: string;
  timestamp: string;
  error?: string;
}

export interface BalanceResult {
  success: boolean;
  balance: number;
  publicKey: string;
  asset_code: string;
  asset_issuer: string;
  timestamp: string;
  error?: string;
}

export interface PublicKeyResult {
  success: boolean;
  publicKey: string | null;
  secretKey: string;
  timestamp: string;
  error?: string;
}

export interface StreamResult {
  success: boolean;
  message?: string;
  error?: string;
  publicKey: string;
  timestamp: string;
}

export interface StreamStatus {
  success: boolean;
  isActive: boolean;
  publicKey: string;
  streamInfo: {
    publicKey: string;
    startTime: string;
    isActive: boolean;
  } | null;
  timestamp: string;
}

export interface TransactionSearchResult {
  success: boolean;
  found: boolean;
  transaction: {
    id: string;
    hash: string;
    ledger: number;
    created_at: string;
    source_account: string;
    source_account_sequence: string;
    fee_charged: string;
    operation_count: number;
    envelope_xdr: string;
    result_xdr: string;
    result_meta_xdr: string;
    fee_meta_xdr: string;
    memo_type: string;
    memo: string;
    successful: boolean;
    paging_token: string;
    operations: Array<any>;
  } | null;
  has_dzt_operations?: boolean;
  dzt_operations_count?: number;
  dzt_operations?: Array<any>;
  hash: string;
  message: string;
  error?: string;
  timestamp: string;
}

export default class SofizPaySDK {
  constructor();
  
  submit(data: SubmitData): Promise<TransactionResult>;
  
  getTransactions(publicKey: string): Promise<TransactionsResult>;
  
  searchTransactionsByMemo(publicKey: string, memo: string, limit?: number): Promise<TransactionsResult>;
  
  getTransactionByHash(transactionHash: string): Promise<TransactionSearchResult>;
  
  getDZTBalance(publicKey: string): Promise<BalanceResult>;
  
  getPublicKey(secretkey: string): Promise<PublicKeyResult>;
  
  startTransactionStream(publicKey: string, onNewTransaction: (transaction: Transaction) => void): Promise<StreamResult>;
  
  stopTransactionStream(publicKey: string): Promise<StreamResult>;
  
  getStreamStatus(publicKey: string): Promise<StreamStatus>;
  
  getVersion(): string;
}
