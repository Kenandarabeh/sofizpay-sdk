export interface SubmitData {
  secretkey: string;
  destinationPublicKey: string;
  amount: number;
  memo: string;
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
  has_operations?: boolean;
  operations_count?: number;
  operations?: Array<any>;
  hash: string;
  message: string;
  error?: string;
  timestamp: string;
}

export interface CIBTransactionData {
  account: string;
  amount: number;
  full_name: string;
  phone: string;
  email: string;
  return_url?: string;
  webhook_url?: string;
  invoice_id?: string;
  language?: 'ar' | 'en' | 'fr' | string;
  memo?: string;
  redirect?: 'yes' | 'no' | boolean;
  keep_return_url?: 'True' | 'False' | boolean;
  is_sandbox?: boolean;
  isSandbox?: boolean;
}

export interface CIBTransactionResult {
  success: boolean;
  data?: any;
  payment_url?: string | null;
  transaction_id?: string | null;
  cib_transaction_id?: string | null;
  order_id?: string | null;
  webhook_url?: string | null;
  account: string;
  amount: number;
  full_name: string;
  phone: string;
  email: string;
  memo?: string;
  is_sandbox?: boolean;
  error?: string;
  errorData?: any;
  timestamp: string;
}

export interface CIBCheckData {
  order_number?: string;
  orderNumber?: string;
  order_id?: string;
  orderId?: string;
  is_sandbox?: boolean;
  isSandbox?: boolean;
}

export interface CIBCheckResult {
  success: boolean;
  data?: any;
  order_number?: string;
  orderStatus?: number;
  status?: string;
  amount?: string | number | null;
  errorMessage?: string | null;
  is_sandbox?: boolean;
  error?: string;
  errorData?: any;
  timestamp: string;
}

export interface ProductItem {
  name: string;
  price: string | number;
  [key: string]: any;
}

export interface GetProductsData {
  encrypted_sk: string;
  search?: string;
}

export interface ProductsResult {
  success: boolean;
  status?: string;
  count: number;
  products: ProductItem[];
  raw?: any;
  error?: string;
  timestamp: string;
}

export interface OperationPostResult {
  success: boolean;
  status?: string;
  message?: string | null;
  operation_id?: string | null;
  transaction_id?: string | null;
  transaction_status?: string | null;
  data?: any;
  error?: string;
  errorData?: any;
  timestamp: string;
}

export interface BillPaymentData {
  encrypted_sk: string;
  amount: number;
  operator: 'ade' | 'sonelgaz' | 'algerie_telecom' | string;
  offer?: string;
  bill?: string;
  customerId?: string;
  ebb?: string;
  phone?: string;
  [key: string]: any;
}

export interface AdeBillData {
  encrypted_sk: string;
  amount: number;
  bill: string;
}

export interface SonelgazBillData {
  encrypted_sk: string;
  amount: number;
  customerId: string;
  ebb: string;
  bill: string;
}

export interface AlgerieTelecomBillData {
  encrypted_sk: string;
  amount: number;
  phone?: string;
  bill?: string;
}

export interface PhoneRechargeData {
  encrypted_sk: string;
  phone: string;
  operator: 'mobilis' | 'djezzy' | 'ooredoo' | string;
  amount: number;
  offer?: 'prepaid' | 'postpaid' | string;
}

export interface InternetRechargeData {
  encrypted_sk: string;
  phone: string;
  operator?: 'idoom' | string;
  amount: number;
  offer: string;
}

export interface GameRechargeData {
  encrypted_sk: string;
  operator: 'pubg' | 'freefire' | string;
  playerId: string;
  amount: number;
  offer: string;
}

export interface OperationDetailsData {
  operation_id: string;
  encrypted_sk: string;
}

export interface OperationDetailsResult {
  success: boolean;
  data?: any;
  operation_id?: string;
  error?: string;
  timestamp: string;
}

export interface SignatureVerificationData {
  message: string;
  signature_url_safe: string;
}

export interface SignatureVerificationResult {
  success: boolean;
  message: string;
  signature: string | null;
  signature_url_safe: string;
  publicKeyPath: string;
  verified: boolean;
  feedback: string;
  error?: string;
  timestamp: string;
}

export default class SofizPaySDK {
  version: string;
  
  constructor();
  
  submit(data: SubmitData): Promise<TransactionResult>;
  
  getTransactions(publicKey: string, limit?: number, cursor?: string | null): Promise<TransactionsResult>;
  
  searchTransactionsByMemo(publicKey: string, memo: string, limit?: number): Promise<TransactionsResult>;
  
  getTransactionByHash(transactionHash: string): Promise<TransactionSearchResult>;
  
  getBalance(publicKey: string): Promise<BalanceResult>;
  
  getPublicKey(secretkey: string): Promise<PublicKeyResult>;
  
  startTransactionStream(
    publicKey: string, 
    onNewTransaction: (transaction: Transaction) => void,
    fromNow?: boolean,
    cursor?: string,
    checkInterval?: number
  ): Promise<StreamResult>;
  
  stopTransactionStream(publicKey: string): Promise<StreamResult>;
  
  getStreamStatus(publicKey: string): Promise<StreamStatus>;
  
  makeCIBTransaction(transactionData: CIBTransactionData): Promise<CIBTransactionResult>;
  
  checkCIBTransaction(data: string | CIBCheckData): Promise<CIBCheckResult>;
  
  cibTransactionCheck(data: string | CIBCheckData): Promise<CIBCheckResult>;
  
  getProducts(options: string | GetProductsData): Promise<ProductsResult>;
  
  executeServiceOperation(operationData: any): Promise<OperationPostResult>;
  
  payBill(billData: BillPaymentData): Promise<OperationPostResult>;
  
  payAdeBill(data: AdeBillData): Promise<OperationPostResult>;
  
  paySonelgazBill(data: SonelgazBillData): Promise<OperationPostResult>;
  
  payAlgerieTelecomBill(data: AlgerieTelecomBillData): Promise<OperationPostResult>;
  
  rechargePhone(data: PhoneRechargeData): Promise<OperationPostResult>;
  
  rechargeInternet(data: InternetRechargeData): Promise<OperationPostResult>;
  
  rechargeGame(data: GameRechargeData): Promise<OperationPostResult>;
  
  getOperationDetails(options: string | OperationDetailsData, secretKeyParam?: string | null): Promise<OperationDetailsResult>;
  
  verifySignature(verificationData: SignatureVerificationData): boolean;
  
  getVersion(): string;
}
