import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { initializeApp, type FirebaseApp } from "firebase/app";

function getEnv(name: string): string | undefined {
  const value: unknown = import.meta.env[name];
  return typeof value === "string" ? value : undefined;
}

const config = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("VITE_FIREBASE_APP_ID"),
  measurementId: getEnv("VITE_FIREBASE_MEASUREMENT_ID"),
};

const hasFirebaseConfig = Boolean(
  config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.storageBucket &&
    config.messagingSenderId &&
    config.appId,
);

export const firebaseApp: FirebaseApp | null = hasFirebaseConfig
  ? initializeApp(config)
  : null;

export const firebaseAnalytics: Promise<Analytics | null> =
  firebaseApp && typeof window !== "undefined"
    ? isSupported()
        .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
        .catch((error: unknown) => {
          console.warn(
            "Firebase Analytics is unavailable in this browser:",
            error,
          );
          return null;
        })
    : Promise.resolve(null);
