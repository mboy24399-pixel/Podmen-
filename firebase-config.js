// ============================================
// MUSICSTREAM — FIREBASE CONFIGURATION
// Version: 1.0.0
// ============================================

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const PAYMENT_LINKS = {
    monthly: "https://rzp.io/l/YOUR_MONTHLY_LINK",
    yearly: "https://rzp.io/l/YOUR_YEARLY_LINK"
};

const APP_CONFIG = {
    name: "MusicStream",
    supportEmail: "support@musicstream.com",
    supportWhatsApp: "+91 98765 43210",
    trialDays: 7
};

console.log("🎵 MusicStream Loaded");
