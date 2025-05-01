import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCgIyZYeLtDQ5nDJpI90QdL8AjqJY3Qhaw",
    authDomain: "gen-ai-banner.firebaseapp.com",
    projectId: "gen-ai-banner",
    storageBucket: "gen-ai-banner.firebasestorage.app",
    messagingSenderId: "278824823653",
    appId: "1:278824823653:web:8c444050c7081a431dcf8c",
    measurementId: "G-VRL94ZCGPN"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);