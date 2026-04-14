import SofizPaySDK from './src/index.js';

// 1. Initialize SDK in Sandbox Mode
const sdk = new SofizPaySDK(true); 

async function testSandbox() {
    console.log("--- Starting SofizPay Node SDK Sandbox Test ---");
    console.log("Current Mode: SANDBOX");

    try {
        // 2. Test makeSandboxCIBTransaction
        console.log("1. Testing makeSandboxCIBTransaction (Dedicated)...");
        const cibResult = await sdk.makeSandboxCIBTransaction({
            account: 'GB3R3DRQXBPSC2XSFLPDRVCAVRCVJXAPJGBPMJ45JBRJC5QJPM7QTUSO',
            amount: 150.0,
            full_name: 'Sandbox Tester',
            phone: '0661000000',
            email: 'sandbox@sofizpay.com',
            memo: 'Node Sandbox Test'
        });
        
        console.log("Result:", JSON.stringify(cibResult, null, 2));

        // 3. Test checkSandboxCIBStatus
        if (cibResult.success && cibResult.data && cibResult.data.cib_transaction_id) {
            const cibTransactionId = cibResult.data.cib_transaction_id;
            console.log(`\n2. Testing checkSandboxCIBStatus for ID: ${cibTransactionId}...`);
            const statusResult = await sdk.checkSandboxCIBStatus(cibTransactionId);
            console.log("Status Result:", JSON.stringify(statusResult, null, 2));
        } else {
            console.log("\n2. Skipping checkCIBStatus (no order number received).");
        }

    } catch (error) {
        console.error("Test Error:", error.message);
    }

    console.log("--- Sandbox Test Completed ---");
}

testSandbox();
