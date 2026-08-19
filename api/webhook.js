// ==================================================
// Podmen - Razorpay Webhook Handler
// Vercel Serverless Function
// ==================================================

const crypto = require('crypto');
const admin = require('firebase-admin');

// ==================================================
// Firebase Admin Initialization
// ==================================================
let firebaseAdminInitialized = false;

function initializeFirebaseAdmin() {
  if (firebaseAdminInitialized && admin.apps.length > 0) {
    return admin.apps[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials are not properly configured');
  }

  // Handle escaped newlines in private key from environment variables
  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

  const app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: formattedPrivateKey
    })
  });

  firebaseAdminInitialized = true;
  return app;
}

// ==================================================
// Raw Body Reader for Vercel Serverless
// ==================================================
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => {
      reject(error);
    });
  });
}

// ==================================================
// Webhook Signature Verification
// ==================================================
function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!signature || !webhookSecret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(signature);

  // Use timing-safe comparison
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

// ==================================================
// Safe Payload Parsing
// ==================================================
function parseWebhookPayload(rawBody) {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    return null;
  }
}

// ==================================================
// Event Type Extraction
// ==================================================
function getEventType(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  return payload.event || null;
}

// ==================================================
// Payment Data Extraction
// ==================================================
function extractPaymentData(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const paymentLink = payload.payload?.payment_link || payload.payload?.paymentLink || null;
  const payment = payload.payload?.payment || null;
  const order = payload.payload?.order || null;

  // Extract payment link entity data
  const linkEntity = paymentLink?.entity || paymentLink || null;
  const paymentEntity = payment?.entity || payment || null;
  const orderEntity = order?.entity || order || null;

  // Extract IDs defensively
  const razorpayLinkId = linkEntity?.id || paymentLink?.id || null;
  const razorpayPaymentId = paymentEntity?.id || payment?.id || null;
  const razorpayOrderId = orderEntity?.id || order?.id || paymentEntity?.order_id || null;

  // Extract amount and currency
  const amount = paymentEntity?.amount || linkEntity?.amount || null;
  const currency = paymentEntity?.currency || linkEntity?.currency || 'INR';

  // Extract status
  const status = paymentEntity?.status || linkEntity?.status || payload.payload?.status || null;

  // Extract notes/metadata for Podmen user ID
  const notes = linkEntity?.notes || paymentEntity?.notes || orderEntity?.notes || {};
  const userId = notes?.userId || notes?.user_id || notes?.podmenUserId || null;

  // Extract plan if available
  const plan = notes?.plan || linkEntity?.description || null;

  return {
    razorpayLinkId,
    razorpayPaymentId,
    razorpayOrderId,
    amount,
    currency,
    status,
    userId,
    plan,
    notes
  };
}

// ==================================================
// Payment Validation
// ==================================================
function validatePayment(paymentData) {
  if (!paymentData) {
    return { valid: false, error: 'No payment data found' };
  }

  if (!paymentData.userId) {
    return { valid: false, error: 'Missing Podmen user identifier' };
  }

  if (!paymentData.razorpayPaymentId && !paymentData.razorpayLinkId) {
    return { valid: false, error: 'Missing payment identifier' };
  }

  if (!paymentData.amount || paymentData.amount <= 0) {
    return { valid: false, error: 'Invalid payment amount' };
  }

  if (paymentData.currency && paymentData.currency !== 'INR') {
    return { valid: false, error: 'Unsupported currency' };
  }

  return { valid: true };
}

// ==================================================
// Premium Duration Mapping
// ==================================================
function getPremiumDuration(plan) {
  // Server-controlled plan mapping
  const planMap = {
    'monthly': 30,
    '30days': 30,
    '30_days': 30,
    'quarterly': 90,
    '90days': 90,
    '90_days': 90,
    'yearly': 365,
    '365days': 365,
    '365_days': 365,
    'annual': 365,
    'premium_30': 30,
    'premium_90': 90,
    'premium_365': 365
  };

  if (plan && typeof plan === 'string') {
    const normalizedPlan = plan.toLowerCase().replace(/\s+/g, '_');
    if (planMap[normalizedPlan]) {
      return planMap[normalizedPlan];
    }
  }

  // Default to 30 days if plan not recognized
  return 30;
}

// ==================================================
// Send JSON Response
// ==================================================
function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// ==================================================
// Record Transaction (Idempotent)
// ==================================================
async function recordTransaction(db, transactionData) {
  const transactionId = transactionData.razorpayPaymentId || 
                         transactionData.razorpayLinkId || 
                         `${transactionData.userId}_${Date.now()}`;

  const transactionRef = db.collection('transactions').doc(transactionId);

  return db.runTransaction(async (transaction) => {
    const existingDoc = await transaction.get(transactionRef);

    if (existingDoc.exists) {
      // Transaction already exists, update if status changed
      const existingData = existingDoc.data();
      if (existingData.status !== transactionData.status) {
        transaction.update(transactionRef, {
          status: transactionData.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      return { created: false, transactionId };
    }

    // Create new transaction
    transaction.set(transactionRef, {
      userId: transactionData.userId,
      razorpayPaymentId: transactionData.razorpayPaymentId || null,
      razorpayOrderId: transactionData.razorpayOrderId || null,
      razorpayLinkId: transactionData.razorpayLinkId || null,
      amount: transactionData.amount || 0,
      currency: transactionData.currency || 'INR',
      status: transactionData.status || 'created',
      plan: transactionData.plan || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { created: true, transactionId };
  });
}

// ==================================================
// Grant Premium (Idempotent)
// ==================================================
async function grantPremium(db, userId, durationDays, paymentId) {
  const userRef = db.collection('users').doc(userId);
  const premiumMarkerRef = db.collection('transactions').doc(paymentId);

  return db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);

    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();

    // Check if this payment has already been processed for premium
    const markerDoc = await transaction.get(premiumMarkerRef);
    if (markerDoc.exists && markerDoc.data()?.premiumGranted === true) {
      return { alreadyProcessed: true };
    }

    const now = new Date();
    const nowTimestamp = admin.firestore.Timestamp.fromDate(now);
    const durationSeconds = durationDays * 24 * 60 * 60;
    
    // Calculate premium start and end
    let premiumStart = nowTimestamp;
    let premiumEnd = new admin.firestore.Timestamp(nowTimestamp.seconds + durationSeconds, 0);

    // If user already has active premium, extend from existing end
    if (userData.isPremium === true && userData.premiumEnd) {
      const existingEnd = userData.premiumEnd;
      if (existingEnd.seconds > nowTimestamp.seconds) {
        premiumStart = existingEnd;
        premiumEnd = new admin.firestore.Timestamp(existingEnd.seconds + durationSeconds, 0);
      }
    }

    // Update user premium status
    transaction.update(userRef, {
      isPremium: true,
      premiumStart: premiumStart,
      premiumEnd: premiumEnd,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Mark premium as granted for this payment
    transaction.set(premiumMarkerRef, {
      premiumGranted: true,
      grantedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { alreadyProcessed: false };
  });
}

// ==================================================
// Process Successful Payment
// ==================================================
async function processSuccessfulPayment(db, paymentData, eventType) {
  console.log('Processing successful payment event:', eventType);

  // Validate payment data
  const validation = validatePayment(paymentData);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Determine premium duration
  const durationDays = getPremiumDuration(paymentData.plan);
  console.log('Premium duration:', durationDays, 'days');

  // Record transaction
  const transactionRecord = {
    userId: paymentData.userId,
    razorpayPaymentId: paymentData.razorpayPaymentId,
    razorpayOrderId: paymentData.razorpayOrderId,
    razorpayLinkId: paymentData.razorpayLinkId,
    amount: paymentData.amount,
    currency: paymentData.currency,
    status: 'paid',
    plan: paymentData.plan || null
  };

  const transactionResult = await recordTransaction(db, transactionRecord);
  console.log('Transaction recorded:', transactionResult);

  // Check if user is blocked before granting premium
  const userRef = db.collection('users').doc(paymentData.userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new Error('User not found for premium grant');
  }

  const userData = userDoc.data();
  
  if (userData.isBlocked === true) {
    console.log('User is blocked, payment recorded but premium not granted');
    // Record payment but don't grant premium access
    return { paymentRecorded: true, premiumGranted: false, blocked: true };
  }

  // Grant premium (idempotent)
  const premiumResult = await grantPremium(
    db,
    paymentData.userId,
    durationDays,
    paymentData.razorpayPaymentId || paymentData.razorpayLinkId
  );

  console.log('Premium grant result:', premiumResult);

  return {
    paymentRecorded: true,
    premiumGranted: !premiumResult.alreadyProcessed,
    alreadyProcessed: premiumResult.alreadyProcessed
  };
}

// ==================================================
// Process Refund
// ==================================================
async function processRefund(db, paymentData) {
  console.log('Processing refund event');

  if (!paymentData.razorpayPaymentId && !paymentData.razorpayLinkId) {
    return { processed: false, error: 'Missing payment identifier for refund' };
  }

  const transactionId = paymentData.razorpayPaymentId || paymentData.razorpayLinkId;
  const transactionRef = db.collection('transactions').doc(transactionId);

  await transactionRef.update({
    status: 'refunded',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Optionally revoke premium if user was premium due to this payment
  // For safety, we'll only update the transaction status
  // Premium revocation requires business logic decision

  return { processed: true };
}

// ==================================================
// Process Failed/Cancelled Payment
// ==================================================
async function processFailedPayment(db, paymentData, status) {
  console.log('Processing failed/cancelled payment event:', status);

  if (!paymentData.razorpayPaymentId && !paymentData.razorpayLinkId) {
    return { processed: false, error: 'Missing payment identifier' };
  }

  const transactionRecord = {
    userId: paymentData.userId || 'unknown',
    razorpayPaymentId: paymentData.razorpayPaymentId,
    razorpayOrderId: paymentData.razorpayOrderId,
    razorpayLinkId: paymentData.razorpayLinkId,
    amount: paymentData.amount || 0,
    currency: paymentData.currency || 'INR',
    status: status || 'failed',
    plan: paymentData.plan || null
  };

  await recordTransaction(db, transactionRecord);

  return { processed: true };
}

// ==================================================
// Main Webhook Handler
// ==================================================
async function handleWebhook(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  try {
    // Read raw body
    const rawBody = await readRawBody(req);
    
    if (!rawBody || rawBody.length === 0) {
      return sendJson(res, 400, { success: false, error: 'Empty request body' });
    }

    // Get webhook secret from environment
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('Webhook secret is not configured');
      return sendJson(res, 500, { success: false, error: 'Server configuration error' });
    }

    // Get signature from headers
    const signature = req.headers['x-razorpay-signature'];
    
    // Verify signature
    if (!signature) {
      return sendJson(res, 400, { success: false, error: 'Missing signature' });
    }

    const isValidSignature = verifyWebhookSignature(rawBody, signature, webhookSecret);
    
    if (!isValidSignature) {
      console.error('Invalid webhook signature');
      return sendJson(res, 401, { success: false, error: 'Invalid signature' });
    }

    // Parse payload
    const payload = parseWebhookPayload(rawBody);
    
    if (!payload) {
      return sendJson(res, 400, { success: false, error: 'Invalid JSON payload' });
    }

    // Get event type
    const eventType = getEventType(payload);
    
    if (!eventType) {
      return sendJson(res, 400, { success: false, error: 'Missing event type' });
    }

    console.log('Webhook event received:', eventType);

    // Initialize Firebase Admin
    initializeFirebaseAdmin();
    const db = admin.firestore();

    // Extract payment data
    const paymentData = extractPaymentData(payload);

    // Handle different event types
    switch (eventType) {
      case 'payment_link.paid':
      case 'payment.paid':
        // Successful payment
        try {
          const result = await processSuccessfulPayment(db, paymentData, eventType);
          console.log('Payment processed successfully');
          return sendJson(res, 200, { 
            success: true,
            processed: true,
            premiumGranted: result.premiumGranted,
            alreadyProcessed: result.alreadyProcessed
          });
        } catch (error) {
          console.error('Error processing successful payment:', error.message);
          return sendJson(res, 500, { success: false, error: 'Failed to process payment' });
        }
        break;

      case 'payment.refunded':
      case 'refund.created':
      case 'payment_link.refunded':
        // Refund events
        try {
          const refundResult = await processRefund(db, paymentData);
          return sendJson(res, 200, { success: true, refunded: refundResult.processed });
        } catch (error) {
          console.error('Error processing refund:', error.message);
          return sendJson(res, 500, { success: false, error: 'Failed to process refund' });
        }
        break;

      case 'payment.failed':
      case 'payment_link.failed':
      case 'payment.cancelled':
      case 'payment_link.cancelled':
        // Failed or cancelled payments
        try {
          const status = eventType.includes('failed') ? 'failed' : 'cancelled';
          await processFailedPayment(db, paymentData, status);
          return sendJson(res, 200, { success: true, recorded: true });
        } catch (error) {
          console.error('Error processing failed payment:', error.message);
          return sendJson(res, 500, { success: false, error: 'Failed to process payment event' });
        }
        break;

      case 'payment_link.pending':
      case 'payment.pending':
        // Payment pending - just acknowledge
        return sendJson(res, 200, { success: true, pending: true });

      default:
        // Unknown event - acknowledge safely without processing
        console.log('Unknown event type:', eventType);
        return sendJson(res, 200, { success: true, ignored: true });
    }

  } catch (error) {
    console.error('Webhook handler error:', error.message);
    return sendJson(res, 500, { success: false, error: 'Internal server error' });
  }
}

// ==================================================
// Vercel Serverless Function Export
// ==================================================
module.exports = async (req, res) => {
  await handleWebhook(req, res);
};
