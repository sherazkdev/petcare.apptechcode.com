import type { App } from "firebase-admin/app";

function firebaseServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "pet-care-app-37e12";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error("FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY is missing");
  }
  return { projectId, clientEmail, privateKey };
}

let initPromise: Promise<App> | null = null;

export async function getFirebaseApp(): Promise<App> {
  if (!initPromise) {
    initPromise = (async () => {
      const account = firebaseServiceAccount();
      const { cert, getApps, initializeApp } = await import("firebase-admin/app");
      const existing = getApps()[0];
      if (existing) return existing;
      return initializeApp({
        credential: cert(account),
        projectId: account.projectId,
      });
    })();
  }
  return initPromise;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string }> {
  const app = await getFirebaseApp();
  const { getAuth } = await import("firebase-admin/auth");
  const decoded = await getAuth(app).verifyIdToken(idToken);
  return { uid: decoded.uid };
}
