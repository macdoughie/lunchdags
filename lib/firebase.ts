"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { doc, getFirestore, onSnapshot, setDoc } from "firebase/firestore";

export type Member = { id: string; name: string; color: string };
export type Rating = { memberId: string; score: number };
export type Visit = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  address: string;
  date: string;
  chooserId: string;
  ratings: Rating[];
};
export type LunchState = { members: Member[]; chooserIndex: number; visits: Visit[] };

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

function stateDoc() {
  if (!firebaseEnabled) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return doc(getFirestore(app), "lunchGroups", "main");
}

export async function connectLunchState(
  initial: LunchState,
  receive: (state: LunchState) => void,
  fail: () => void,
) {
  const ref = stateDoc();
  if (!ref) return () => {};
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    await signInAnonymously(getAuth(app));
    return onSnapshot(ref, async (snap) => {
      if (snap.exists()) receive(snap.data() as LunchState);
      else await setDoc(ref, initial);
    }, fail);
  } catch {
    fail();
    return () => {};
  }
}

export async function saveLunchState(state: LunchState) {
  const ref = stateDoc();
  if (!ref) return false;
  await setDoc(ref, state);
  return true;
}
