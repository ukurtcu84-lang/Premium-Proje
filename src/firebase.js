import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCeGblmCa3eZtviSBh7BC0liomA2GGdBqs", 
  authDomain: "premiumproje.firebaseapp.com",
  projectId: "premiumproje",
  storageBucket: "premiumproje.firebasestorage.app",
  messagingSenderId: "60352240448",
  appId: "1:60352240448:web:a50e1696e5a7c22ccef8a5",
  measurementId: "G-SDYSXSS2R3"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = "premiumproje";
