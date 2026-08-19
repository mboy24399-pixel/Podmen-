// ==================================================
// Podmen - Firebase Configuration & Service Exports
// Music + Podcast Streaming Web App
// ==================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  writeBatch,
  increment,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==================================================
// Firebase Web Configuration
// Replace these placeholder values with your real
// Firebase project configuration.
// ==================================================
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ==================================================
// Initialize Firebase (exactly once)
// ==================================================
const app = initializeApp(firebaseConfig);

// ==================================================
// Firebase Services
// ==================================================
const auth = getAuth(app);
const db = getFirestore(app);

// ==================================================
// Google Authentication Provider
// ==================================================
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// ==================================================
// Error Normalization Helper
// Converts Firebase errors into readable messages.
// ==================================================
function normalizeFirebaseError(error) {
  if (!error || typeof error !== "object") {
    return "An unknown error occurred. Please try again.";
  }

  const code = error.code || "";
  const message = error.message || "";

  switch (code) {
    case "auth/popup-closed-by-user":
      return "Google sign-in popup was closed before completing. Please try again.";
    case "auth/popup-blocked":
      return "The sign-in popup was blocked by your browser. Please allow popups and try again.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection and try again.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with the same email address using a different sign-in method.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled. Please contact support.";
    case "auth/cancelled-popup-request":
      return "Sign-in request was cancelled. Please try again.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized for Google authentication.";
    case "permission-denied":
      return "You do not have permission to perform this action.";
    case "unavailable":
      return "The service is temporarily unavailable. Please try again later.";
    case "not-found":
      return "The requested resource was not found.";
    default:
      // Return a safe, generic message for all other errors
      return "An unexpected error occurred. Please try again.";
  }
}

// ==================================================
// Named Exports
// ==================================================

// Firebase App
export { app };

// Firebase Authentication
export { auth };

// Firestore Database
export { db };

// Google Authentication Provider
export { googleProvider };

// Authentication Functions
export { signInWithPopup, signOut, onAuthStateChanged };

// Firestore Functions
export {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  writeBatch,
  increment,
  arrayUnion,
  arrayRemove
};

// Error Helper
export { normalizeFirebaseError };
