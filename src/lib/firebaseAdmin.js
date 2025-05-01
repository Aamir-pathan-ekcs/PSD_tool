import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
};

console.log("Env vars:", {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY ? "defined" : "undefined",
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
});

const app = initializeApp({
  credential: cert(serviceAccount),
});

export const db = getFirestore(app);
// Initialize Firebase Admin only if it hasn't been initialized yet
// let db;
// const appName = "default-app"; // Optional: give the app a name
// if (!getApps().length) {
//   try {
//     initializeApp({
//       credential: cert(serviceAccount),
//     }, appName);
//     console.log("Firebase Admin initialized successfully");
//   } catch (error) {
//     console.error("Error initializing Firebase Admin:", error);
//     throw error;
//   }
// } else {
//   console.log("Firebase Admin already initialized, reusing existing app");
// }

// // Get the Firestore instance
// try {
//   db = getFirestore(getApp(appName));
// } catch (error) {
//   console.error("Error getting Firestore instance:", error);
//   throw error;
// }

// export { db };