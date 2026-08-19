import SofizPaySDK from '../dist/sofizpay-sdk.esm.js';

// =============================================================
// 🔑  ضع مفاتيحك هنا
// =============================================================

const MY_SECRET_KEY      = '';   // مفتاحك السري (يبدأ بـ S)
const MY_PUBLIC_KEY      = '';   // مفتاحك العام (يبدأ بـ G)
const RECIPIENT_KEY      = '';   // المفتاح العام للمستقبل
const MY_ENCRYPTED_SK    = MY_SECRET_KEY;   // نفس المفتاح السري (يُستخدم مع خدمات الفواتير والمنتجات)

// =============================================================

async function runTests() {
  console.log('--- Starting SofizPay SDK Tests ---');
  const sdk = new SofizPaySDK();

  console.log('SDK Version:', sdk.getVersion());

  // ─────────────────────────────────────────
  // ✅ Test 1: التحقق من وجود جميع الـ Methods
  // ─────────────────────────────────────────
  const requiredMethods = [
    'submit',
    'getBalance',
    'getTransactions',
    'getPublicKey',
    'startTransactionStream',
    'stopTransactionStream',
    'getStreamStatus',
    'searchTransactionsByMemo',
    'getTransactionByHash',
    'makeCIBTransaction',
    'checkCIBTransaction',
    'cibTransactionCheck',
    'getProducts',
    'executeServiceOperation',
    'payBill',
    'payAdeBill',
    'paySonelgazBill',
    'payAlgerieTelecomBill',
    'rechargePhone',
    'rechargeInternet',
    'rechargeGame',
    'getOperationDetails',
    'verifySignature'
  ];

  let missing = [];
  for (const method of requiredMethods) {
    if (typeof sdk[method] !== 'function') {
      missing.push(method);
    }
  }

  if (missing.length === 0) {
    console.log('✅ All 23 expected methods exist on SDK instance.');
  } else {
    console.error('❌ Missing methods:', missing);
  }

  // ─────────────────────────────────────────
  // ✅ Test 2: استخراج المفتاح العام من السري
  // ─────────────────────────────────────────
  console.log('\n--- استخراج المفتاح العام من المفتاح السري ---');
  const keyResult = await sdk.getPublicKey(MY_SECRET_KEY);
  if (keyResult.success) {
    console.log('✅ Public Key المستخرج:', keyResult.publicKey);
  } else {
    console.error('❌ فشل استخراج المفتاح:', keyResult.error);
  }

  // ─────────────────────────────────────────
  // ✅ Test 3: رصيد حسابك
  // ─────────────────────────────────────────
  console.log('\n--- التحقق من رصيد الحساب ---');
  const balance = await sdk.getBalance(MY_PUBLIC_KEY);
  if (balance.success) {
    console.log(`✅ الرصيد: ${balance.balance} ${balance.asset_code}`);
  } else {
    console.error('❌ خطأ في جلب الرصيد:', balance.error);
  }

  // ─────────────────────────────────────────
  // ✅ Test 4: إرسال دفعة مباشرة DZT
  // ─────────────────────────────────────────
  console.log('\n--- إرسال دفعة DZT مباشرة ---');
  const payment = await sdk.submit({
    secretkey: MY_SECRET_KEY,
    destinationPublicKey: RECIPIENT_KEY,
    amount: 1,
    memo: 'اختبار SDK'
  });
  if (payment.success) {
    console.log('✅ الدفعة أُرسلت! Hash:', payment.transactionHash);
  } else {
    console.error('❌ فشل الإرسال:', payment.error);
  }

  // ─────────────────────────────────────────
  // ✅ Test 5: إنشاء معاملة CIB / الذهبية (Sandbox)
  // ─────────────────────────────────────────
  console.log('\n--- إنشاء معاملة CIB (Sandbox) ---');
  const cib = await sdk.makeCIBTransaction({
    account: MY_PUBLIC_KEY,
    amount: 1000,
    full_name: 'Ahmed Ben Ali',
    phone: '+213661234567',
    email: 'test@example.com',
    return_url: 'https://mystore.com/callback',
    webhook_url: 'https://mystore.com/api/webhook',
    memo: 'طلب اختباري #001',
    is_sandbox: true    // ← بيئة اختبار (لا يُخصم مال حقيقي)
  });
  if (cib.success) {
    console.log('✅ CIB Transaction created!');
    console.log('   Payment URL:', cib.payment_url || cib.data?.payment_url);
  } else {
    console.error('❌ فشل CIB:', cib.error, cib.errorData);
  }

  // ─────────────────────────────────────────
  // ✅ Test 6: جلب قائمة المنتجات
  // ─────────────────────────────────────────
  console.log('\n--- جلب كتالوج المنتجات ---');
  const products = await sdk.getProducts({ encrypted_sk: MY_ENCRYPTED_SK });
  if (products.success) {
    console.log(`✅ ${products.count} منتج متوفر`);
    console.log('\n📋 قائمة كاملة بالمنتجات:');
    console.log('━'.repeat(60));
    products.products.forEach((p, i) => {
      // عرض كل بيانات المنتج
      const name     = p.name       || p.title    || p.product_name || 'بدون اسم';
      const price    = p.price      || p.amount   || p.cost         || '—';
      const category = p.category   || p.type     || p.operator     || '';
      const offer    = p.offer      || p.offer_id || '';
      console.log(`${String(i + 1).padStart(3, ' ')}. [${category || '—'}] ${name} → ${price} DZT ${offer ? `(${offer})` : ''}`);
    });
    console.log('━'.repeat(60));
    console.log('\n📦 البيانات الخام لأول منتج (لمعرفة هيكل البيانات):');
    console.log(JSON.stringify(products.products[0], null, 2));
  } else {
    console.error('❌ فشل جلب المنتجات:', products.error);
  }


  // ─────────────────────────────────────────
  // ✅ Test 7: اختبار التحقق من validations (بدون مفاتيح حقيقية)
  // ─────────────────────────────────────────
  console.log('\n--- اختبار التحقق من المدخلات ---');
  try { await sdk.makeCIBTransaction({}); }
  catch (err) { console.log('✅ makeCIBTransaction validation:', err.message); }

  try { await sdk.checkCIBTransaction(''); }
  catch (err) { console.log('✅ checkCIBTransaction validation:', err.message); }

  try { await sdk.payAdeBill({ encrypted_sk: 'X', amount: 100 }); }
  catch (err) { console.log('✅ payAdeBill validation:', err.message); }

  try { await sdk.rechargeGame({ encrypted_sk: 'X', operator: 'pubg', amount: 100 }); }
  catch (err) { console.log('✅ rechargeGame validation:', err.message); }

  console.log('\n✅ انتهى اختبار الـ SDK بنجاح!');
}

runTests().catch(err => {
  console.error('❌ Test run failed:', err);
  process.exit(1);
});
