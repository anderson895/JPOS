import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDdsmrBNXcWCfuL-tr0QeEqdtvRm_C6h28",
  authDomain: "jpos-f801b.firebaseapp.com",
  projectId: "jpos-f801b",
  storageBucket: "jpos-f801b.firebasestorage.app",
  messagingSenderId: "832104737442",
  appId: "1:832104737442:web:a5622140665dc0297705fb",
  measurementId: "G-NPE5G820F3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
