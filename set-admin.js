'use strict';

const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const uid = process.argv[2];
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'emarni-chat';

if (!uid) {
  console.error('Usage: npm run set-admin -- FIREBASE_AUTH_UID');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault(), projectId });
}

async function main() {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), admin: true });
  console.log(`Admin role assigned to Firebase UID: ${uid}`);
  console.log('The account may need to sign out and sign in again to refresh its token.');
}

main().catch(error => {
  console.error('Could not assign admin role:', error.message || error);
  process.exitCode = 1;
});
