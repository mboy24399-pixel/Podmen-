// ============================================
// FIREBASE CONFIGURATION — Apna Config Daalo
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyAo5rUsL_duX3-G091B6d_jpNEsDXhPVCM",
  authDomain: "podcast-fdfb4.firebaseapp.com",
  projectId: "podcast-fdfb4",
  storageBucket: "podcast-fdfb4.firebasestorage.app",
  messagingSenderId: "722798022241",
  appId: "1:722798022241:web:0470e5815d98ed0599a420"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Services
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================
// RAZORPAY PAYMENT LINKS — Apne Links Daalo
// ============================================

const PAYMENT_LINKS = {
    monthly: "https://rzp.io/rzp/podmen2",
    yearly: "https://rzp.io/rzp/podman"
};

console.log("🎵 MusicStream Initialized");
