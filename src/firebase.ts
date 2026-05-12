import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'demo-key',
  authDomain: 'demo-local',
  projectId: 'filesharingapp-c9622',
  storageBucket: 'filesharingapp-c9622.appspot.com',
  messagingSenderId: '000000000000',
  appId: 'demo-app-id',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');

// Connexion aux émulateurs Firebase locaux (aucun coût, aucun cloud)
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
connectFirestoreEmulator(db, 'localhost', 8080);
connectStorageEmulator(storage, 'localhost', 9199);
connectFunctionsEmulator(functions, 'localhost', 5001);
