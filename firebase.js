// Emarni Chat - Firebase layer (Auth, Realtime Database, callable Functions)
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile as updateAuthProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  runTransaction,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";


import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";

// Firebase project configuration.
// Deploy the matching database and storage rules before using the app.

const firebaseConfig = {
  apiKey: "AIzaSyBbvQfpdM7-WzbYrn2WfygvPS2iRVaEMHY",
  authDomain: "emarni-chat.firebaseapp.com",
  databaseURL: "https://emarni-chat-default-rtdb.firebaseio.com/",
  projectId: "emarni-chat",
  storageBucket: "emarni-chat.firebasestorage.app",
  messagingSenderId: "787575452024",
  appId: "1:787575452024:web:11fc477a865cb8b8b8588d",
  measurementId: "G-DVV3E0FHLV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const functions = getFunctions(app);

let currentUser = null;
let authHasResolved = false;

const authCallbacks = new Set();

onAuthStateChanged(auth, async user => {
  if (user?.isAnonymous) {
    // Older versions used anonymous sign-in.
    // This version requires a registered account.
    await signOut(auth).catch(() => {});
    return;
  }

  currentUser = user || null;
  authHasResolved = true;

  for (const callback of authCallbacks) {
    callback(currentUser);
  }
});

export function watchAuth(callback) {
  authCallbacks.add(callback);

  if (authHasResolved) {
    callback(currentUser);
  }

  return () => authCallbacks.delete(callback);
}

export function getCurrentUser() {
  return currentUser;
}

export async function registerAccount({
  email,
  password,
  displayName
}) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(
      "emarni-pending-signup-name",
      displayName.trim().slice(0, 32)
    );
  }

  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );

  await updateAuthProfile(credential.user, {
    displayName: displayName.trim().slice(0, 32)
  });

  await ensureUserProfile(credential.user, displayName);

  return credential.user;
}

export async function signInAccount(login, password) {
  const value = String(login || "").trim();

  let credential;

  if (value.includes("@")) {
    credential = await signInWithEmailAndPassword(
      auth,
      value,
      password
    );
  } else {
    const signInById = httpsCallable(
      functions,
      "signInWithEmarniId"
    );

    const result = await signInById({
      emarniId: value.toUpperCase(),
      password
    });

    credential = await signInWithCustomToken(
      auth,
      result.data.customToken
    );
  }

  await ensureUserProfile(
    credential.user,
    (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("emarni-pending-signup-name")
    ) ||
    credential.user.displayName ||
    ""
  );

  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("emarni-pending-signup-name");
  }

  return credential.user;
}

export function signOutAccount() {
  return signOut(auth);
}

function makeEmarniId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "EM";

  for (let i = 0; i < 8; i += 1) {
    result += chars[
      Math.floor(Math.random() * chars.length)
    ];
  }

  return result;
}

export async function ensureUserProfile(
  user,
  preferredName = ""
) {
  if (!user) {
    throw new Error("Sign in before opening a profile.");
  }

  const profileRef = ref(db, `users/${user.uid}/profile`);

  const pendingName =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("emarni-pending-signup-name")
      : "";

  const initialName = (
    pendingName ||
    preferredName ||
    user.displayName ||
    user.email?.split("@")[0] ||
    "Emarni user"
  ).trim().slice(0, 32);

  const transaction = await runTransaction(
    profileRef,
    current => {
      if (current) return current;

      return {
        uid: user.uid,
        emarniId: makeEmarniId(),
        displayName:
          initialName.length >= 2
            ? initialName
            : "Emarni user",
        bio: "",
        photoURL: "",
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    },
    { applyLocally: false }
  );

  if (
    !transaction.committed ||
    !transaction.snapshot.exists()
  ) {
    throw new Error("Could not initialise your profile.");
  }

  const profile = transaction.snapshot.val();

  const publicRef = ref(
    db,
    `userDirectory/${profile.emarniId}`
  );

  const publicSnapshot = await get(publicRef);

  if (
    !publicSnapshot.exists() ||
    publicSnapshot.val()?.uid === user.uid
  ) {
    await set(publicRef, {
      uid: user.uid,
      emarniId: profile.emarniId,
      displayName: profile.displayName,
      bio: profile.bio || "",
      photoURL: profile.photoURL || "",
      createdAt: profile.createdAt || Date.now()
    });
  }

  if (user.displayName !== profile.displayName) {
    await updateAuthProfile(user, {
      displayName: profile.displayName
    }).catch(() => {});
  }

  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("emarni-pending-signup-name");
  }

  return profile;
}

export function watchUserDirectory(callback, onError) {
  return onValue(
    ref(db, "userDirectory"),
    snapshot => callback(snapshot.val() || {}),
    error => onError?.(error)
  );
}

export function watchFriendships(uid, callback, onError) {
  return onValue(
    ref(db, `friendships/${uid}`),
    snapshot => callback(snapshot.val() || {}),
    error => onError?.(error)
  );
}

export function watchIncomingRequests(uid, callback, onError) {
  return onValue(
    ref(db, `friendRequests/${uid}`),
    snapshot => callback(snapshot.val() || {}),
    error => onError?.(error)
  );
}

export async function sendFriendRequest(recipientUid, profile) {
  if (!currentUser) {
    throw new Error(
      "Sign in before sending friend requests."
    );
  }

  if (
    !recipientUid ||
    recipientUid === currentUser.uid
  ) {
    throw new Error(
      "You cannot send a friend request to yourself."
    );
  }

  const existing = await get(
    ref(db, `friendships/${currentUser.uid}/${recipientUid}`)
  );

  if (existing.val()?.status === "accepted") {
    throw new Error("You are already friends.");
  }

  const requestRef = ref(
    db,
    `friendRequests/${recipientUid}/${currentUser.uid}`
  );

  await set(requestRef, {
    fromUid: currentUser.uid,
    fromEmarniId: profile.emarniId,
    fromName: profile.displayName,
    status: "pending",
    createdAt: Date.now()
  });
}

export async function respondFriendRequest(
  requesterUid,
  accept
) {
  if (!currentUser) {
    throw new Error(
      "Sign in before responding to requests."
    );
  }

  const requestRef = ref(
    db,
    `friendRequests/${currentUser.uid}/${requesterUid}`
  );

  const requestSnapshot = await get(requestRef);

  if (
    !requestSnapshot.exists() ||
    requestSnapshot.val()?.status !== "pending"
  ) {
    throw new Error(
      "This friend request is no longer available."
    );
  }

  await update(requestRef, {
    status: accept ? "accepted" : "declined",
    respondedAt: Date.now()
  });

  if (accept) {
    const relationship = {
      status: "accepted",
      since: Date.now()
    };

    await update(ref(db), {
      [`friendships/${currentUser.uid}/${requesterUid}`]: relationship,
      [`friendships/${requesterUid}/${currentUser.uid}`]: relationship
    });
  }
}

// Private rooms are created by the clients themselves (no Cloud Functions needed).
// Room id = both user ids, sorted and joined with "__".
export async function openPrivateChat(otherUid) {
  if (!currentUser) throw new Error("Sign in before opening a chat.");
  if (!otherUid || otherUid === currentUser.uid) throw new Error("Choose a friend to chat with.");
  const roomId = [currentUser.uid, otherUid].sort().join("__");
  // Each user only marks their own membership (safe to repeat).
  await set(ref(db, `privateRooms/${roomId}/members/${currentUser.uid}`), true);
  return roomId;
}

// ---------- Private (direct) messages ----------
const roomMessages = roomId => ref(db, `privateRooms/${roomId}/messages`);

export function watchMessages(chat, callback, onError) {
  const q = query(roomMessages(chat.id), orderByChild("createdAt"), limitToLast(100));
  return onValue(q, snap => {
    const list = [];
    snap.forEach(c => { list.push({ id: c.key, ...c.val() }); });
    list.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    callback(list);
  }, err => onError?.(err));
}

export async function sendMessage(chat, text, profile) {
  if (!currentUser) throw new Error("Sign in before sending a message.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Write a message first.");
  if (clean.length > 1000) throw new Error("Messages can contain up to 1,000 characters.");
  const msgRef = push(roomMessages(chat.id));
  await set(msgRef, {
    uid: currentUser.uid,
    senderName: String(profile?.displayName || currentUser.displayName || "Emarni user").slice(0, 32),
    senderEmarniId: String(profile?.emarniId || ""),
    senderPhotoURL: String(profile?.photoURL || ""),
    text: clean,
    deleted: false,
    createdAt: serverTimestamp()
  });
  return msgRef.key;
}

// Delete: the sender removes their own message. A safety copy (admin-only) is kept for
// 30 days first; the admin panel removes copies older than 30 days.
export async function deleteMessage(chat, messageId) {
  if (!currentUser) throw new Error("Sign in first.");
  const msgRef = ref(db, `privateRooms/${chat.id}/messages/${messageId}`);
  const snap = await get(msgRef);
  if (!snap.exists()) return { deleted: true };
  const m = snap.val();
  if (m.uid !== currentUser.uid) throw new Error("You can delete only your own messages.");
  await set(ref(db, `moderationArchive/${messageId}`), {
    roomId: chat.id,
    messageId,
    uid: m.uid,
    senderName: m.senderName || "",
    text: m.text || "",
    createdAt: Number(m.createdAt) || 0,
    deletedBy: currentUser.uid,
    deletedAt: serverTimestamp()
  });
  await remove(msgRef);
  return { deleted: true };
}

// Report: saved under /reports (users can only write; only admins can read).
export async function reportMessage(chat, messageId, reason) {
  if (!currentUser) throw new Error("Sign in first.");
  const snap = await get(ref(db, `privateRooms/${chat.id}/messages/${messageId}`));
  if (!snap.exists()) throw new Error("This message no longer exists.");
  const msg = snap.val();
  if (msg.uid === currentUser.uid) throw new Error("You cannot report your own message.");
  try {
    await set(ref(db, `reports/${messageId}_${currentUser.uid}`), {
      type: "message",
      roomId: chat.id,
      messageId,
      reportedUid: msg.uid,
      reporterUid: currentUser.uid,
      messageText: msg.text,
      reason: String(reason || "").trim().slice(0, 200),
      status: "open",
      createdAt: serverTimestamp()
    });
  } catch (err) {
    if (/permission/i.test(err?.message || "")) throw new Error("Could not send the report. You may have already reported this message.");
    throw err;
  }
  return { reported: true };
}

// ---------- Report a user ----------
export async function reportUser(otherUid, reason) {
  if (!currentUser) throw new Error("Sign in first.");
  try {
    await set(ref(db, `reports/user_${otherUid}_${currentUser.uid}`), {
      type: "user",
      reportedUid: otherUid,
      reporterUid: currentUser.uid,
      reason: String(reason || "").trim().slice(0, 200),
      status: "open",
      createdAt: serverTimestamp()
    });
  } catch (err) {
    if (/permission/i.test(err?.message || "")) throw new Error("Could not send the report. You may have already reported this user.");
    throw err;
  }
  return { reported: true };
}

// ---------- Account email (admin-only) and one-time safety notice ----------
export function syncAccount(user) {
  return set(ref(db, `userAccounts/${user.uid}`), { uid: user.uid, email: user.email || "", updatedAt: serverTimestamp() });
}
export async function needsNotice() {
  return !(await get(ref(db, `noticeAcks/${currentUser.uid}`))).exists();
}
export function acknowledgeNotice() {
  return set(ref(db, `noticeAcks/${currentUser.uid}`), { version: 1, at: serverTimestamp() });
}

// ---------- Admin panel ----------
export const signInEmail = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
export const sendResetEmail = email => sendPasswordResetEmail(auth, email);
export const roomIdFor = (a, b) => [a, b].sort().join("__");
export async function checkAdmin(user) {
  try {
    if ((await user.getIdTokenResult()).claims.admin === true) return "ok";
  } catch { /* continue */ }
  try {
    if ((await get(ref(db, `admins/${user.uid}`))).val() === true) return "ok";
  } catch {
    return "rules"; // permission denied: the latest database rules are not published yet
  }
  try {
    await get(ref(db, "admins")); // readable only by admins (flag, claim or the admin email in the rules)
    return "ok";
  } catch {
    return "no";
  }
}
export const watchPath = (path, callback, onError) =>
  onValue(ref(db, path), snap => callback(snap.val() || {}), err => onError?.(err));
export const watchRoomArchive = (roomId, callback, onError) =>
  onValue(query(ref(db, "moderationArchive"), orderByChild("roomId"), equalTo(roomId)),
    snap => callback(snap.val() || {}), err => onError?.(err));
export const resolveReport = id => set(ref(db, `reports/${id}/status`), "resolved");
export const purgeArchive = keys => update(ref(db), Object.fromEntries(keys.map(k => [`moderationArchive/${k}`, null])));
export const logAdminView = roomId => push(ref(db, "adminAudit"), { adminUid: currentUser.uid, roomId, at: serverTimestamp() });
