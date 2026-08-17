const crypto = require('crypto');
const admin = require('firebase-admin');

const serviceAccount = {
    type: process.env.FIREBASE_TYPE || 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID || '',
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || '',
    private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    client_email: process.env.FIREBASE_CLIENT_EMAIL || '',
    client_id: process.env.FIREBASE_CLIENT_ID || '',
    auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL || ''
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
        const signature = req.headers['x-razorpay-signature'] || '';
        const body = JSON.stringify(req.body);
        
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(body)
            .digest('hex');
        
        if (signature !== expectedSignature) {
            console.error('Invalid signature');
            return res.status(400).json({ error: 'Invalid signature' });
        }
        
        const event = req.body.event;
        const paymentData = req.body.payload.payment.entity;
        
        console.log('Webhook event:', event);
        
        if (event === 'payment.captured') {
            const paymentId = paymentData.id;
            const orderId = paymentData.order_id;
            const amount = paymentData.amount;
            const email = paymentData.email;
            const notes = paymentData.notes || {};
            const userId = notes.userId || email;
            const plan = notes.plan || 'monthly';
            
            await db.collection('payments').doc(paymentId).set({
                paymentId: paymentId,
                orderId: orderId,
                amount: amount,
                email: email,
                plan: plan,
                userId: userId,
                status: 'captured',
                method: paymentData.method || 'unknown',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            let expiryDate = new Date();
            if (plan === 'yearly') {
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            } else if (plan === 'lifetime') {
                expiryDate = new Date('2099-12-31T23:59:59.999Z');
            } else {
                expiryDate.setMonth(expiryDate.getMonth() + 1);
            }
            
            await db.collection('users').doc(userId).update({
                subscriptionActive: true,
                subscriptionPlan: plan,
                subscriptionExpiry: expiryDate.toISOString(),
                trialEnd: expiryDate.toISOString(),
                lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
                lastPaymentAmount: amount,
                lastPaymentId: paymentId
            });
            
            console.log('✅ Premium activated for:', userId);
            return res.status(200).json({ success: true });
        }
        
        if (event === 'payment.failed') {
            const paymentId = paymentData.id;
            const amount = paymentData.amount;
            const email = paymentData.email;
            
            await db.collection('payments').doc(paymentId).set({
                paymentId: paymentId,
                amount: amount,
                email: email,
                status: 'failed',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            return res.status(200).json({ success: true });
        }
        
        return res.status(200).json({ received: true });
        
    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({ error: error.message });
    }
};
