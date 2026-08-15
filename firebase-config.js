// ============================================
// MUSICSTREAM — FIREBASE CONFIGURATION
// Version: 1.0.0
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyAo5rUsL_duX3-G091B6d_jpNEsDXhPVCM",
  authDomain: "podcast-fdfb4.firebaseapp.com",
  projectId: "podcast-fdfb4",
  storageBucket: "podcast-fdfb4.firebasestorage.app",
  messagingSenderId: "722798022241",
  appId: "1:722798022241:web:0470e5815d98ed0599a420"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const PAYMENT_LINKS = {
    monthly: "https://rzp.io/rzp/podmen2",
    yearly: "https://rzp.io/rzp/podman"
};

const APP_CONFIG = {
    name: "MusicStream",
    supportEmail: "support@musicstream.com",
    supportWhatsApp: "+91 98765 43210",
    trialDays: 7
};

console.log("🎵 MusicStream Loaded");
