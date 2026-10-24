import * as fb from "./firebase.js?v=8";

const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
};

const state = {
  user: null, profile: null,
  dir: {}, byUid: {}, friends: {}, requests: {}, sent: new Set(),
  chat: null, friendUid: null, report: null,
  seq: 0, unsubMsgs: null, unsubs: []
};
// Set to false to show the Admin link only to admin accounts.
const ADMIN_LINK_FOR_EVERYONE = true;
let signupMode = false;
const splashStart = Date.now();

const AUTH_ERRORS = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/email-already-in-use": "This email is already registered.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Try again later.",
  "auth/network-request-failed": "Network error. Check your connection."
};
const errText = e => {
  const msg = String(e?.message || e?.code || "");
  if (AUTH_ERRORS[e?.code]) return AUTH_ERRORS[e.code];
  if (/permission[_ ]denied/i.test(msg)) return "Permission denied. Publish the latest database.rules.json in the Firebase Console.";
  return msg.replace(/^Firebase:\s*/, "") || "Something went wrong";
};
const initial = name => (String(name || "?").trim()[0] || "?").toUpperCase();
const person = uid => state.byUid[uid] || { uid, displayName: "Emarni user", emarniId: "" };

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 3000);
}

/* ---------- Loading screen ---------- */
function hideSplash() {
  const s = $("splash");
  if (!s || s.dataset.hiding) return;
  s.dataset.hiding = "1";
  const wait = Math.max(0, 1600 - (Date.now() - splashStart)); // show the animation at least 1.6s
  setTimeout(() => { s.classList.add("done"); setTimeout(() => s.remove(), 700); }, wait);
}

function show(view) {
  $("auth").classList.toggle("hidden", view !== "auth");
  $("app").classList.toggle("hidden", view !== "app");
}

/* ---------- Auth ---------- */
function setMode(signup) {
  signupMode = signup;
  $("authTitle").textContent = signup ? "Create your account" : "Welcome back";
  $("authBtn").textContent = signup ? "Create account" : "Sign in";
  $("switchBtn").textContent = signup ? "Already have an account? Sign in" : "New to Emarni? Create an account";
  $("name").classList.toggle("hidden", !signup);
  $("name").required = signup;
  $("password").autocomplete = signup ? "new-password" : "current-password";
  $("authError").textContent = "";
}
$("switchBtn").onclick = () => setMode(!signupMode);

$("authForm").onsubmit = async e => {
  e.preventDefault();
  const btn = $("authBtn");
  btn.disabled = true;
  $("authError").textContent = "";
  try {
    const email = $("email").value.trim(), password = $("password").value;
    if (signupMode) await fb.registerAccount({ email, password, displayName: $("name").value });
    else await fb.signInAccount(email, password);
  } catch (err) {
    $("authError").textContent = errText(err);
  } finally {
    btn.disabled = false;
  }
};
$("signOut").onclick = () => fb.signOutAccount();

fb.watchAuth(async user => {
  stopAll();
  if (!user) {
    state.user = state.profile = null;
    $("adminLink").classList.add("hidden");
    show("auth");
    hideSplash();
    return;
  }
  try {
    state.user = user;
    state.profile = await fb.ensureUserProfile(user);
    $("meName").textContent = state.profile.displayName;
    $("meId").textContent = "ID: " + state.profile.emarniId;
    $("meAvatar").textContent = initial(state.profile.displayName);
    show("app");
    startWatchers();
    fb.syncAccount(user).catch(() => {});
    if (ADMIN_LINK_FOR_EVERYONE) $("adminLink").classList.remove("hidden");
    else fb.checkAdmin(user).then(s => $("adminLink").classList.toggle("hidden", s !== "ok" && s !== true));
    fb.needsNotice().then(need => { if (need) $("noticeDlg").showModal(); }).catch(() => {});
  } catch (err) {
    toast(errText(err));
    show("auth");
  }
  hideSplash();
});

/* ---------- Realtime data: directory, friends, requests ---------- */
function startWatchers() {
  const uid = state.user.uid, onErr = e => toast(errText(e));
  state.unsubs.push(
    fb.watchUserDirectory(dir => {
      state.dir = dir;
      state.byUid = Object.fromEntries(Object.values(dir).map(d => [d.uid, d]));
      renderFriends();
      renderRequests();
      renderResults();
    }, onErr),
    fb.watchFriendships(uid, f => { state.friends = f; renderFriends(); renderResults(); }, onErr),
    fb.watchIncomingRequests(uid, r => { state.requests = r; renderRequests(); renderResults(); }, onErr)
  );
}

function stopAll() {
  state.unsubs.forEach(unsub => unsub());
  state.unsubs = [];
  state.dir = {}; state.byUid = {}; state.friends = {}; state.requests = {}; state.sent.clear();
  $("search").value = "";
  $("results").innerHTML = "";
  closeChat();
}

function renderFriends() {
  const ul = $("friends");
  ul.innerHTML = "";
  const people = Object.keys(state.friends)
    .filter(id => state.friends[id]?.status === "accepted")
    .map(person)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (!people.length) return ul.append(h("li", { className: "none", textContent: "No friends yet. Add one by Emarni ID." }));
  people.forEach(p => ul.append(h("li",
    { className: p.uid === state.friendUid ? "active" : "", onclick: () => openChat(p.uid) },
    h("div", { className: "avatar", textContent: initial(p.displayName) }),
    h("div", { className: "grow" }, h("strong", { textContent: p.displayName }), h("small", { textContent: p.emarniId }))
  )));
}

function renderRequests() {
  const ul = $("requests");
  ul.innerHTML = "";
  const pending = Object.entries(state.requests).filter(([, r]) => r?.status === "pending");
  if (!pending.length) return ul.append(h("li", { className: "none", textContent: "No pending requests" }));
  pending.forEach(([uid, r]) => ul.append(h("li", {},
    h("div", { className: "grow" }, h("strong", { textContent: r.fromName }), h("small", { textContent: r.fromEmarniId })),
    h("button", { className: "btn sm", textContent: "Accept", onclick: () => answerRequest(uid, true) }),
    h("button", { className: "link", textContent: "Decline", onclick: () => answerRequest(uid, false) })
  )));
}

async function answerRequest(uid, accept) {
  try {
    await fb.respondFriendRequest(uid, accept);
    toast(accept ? "Friend added" : "Request declined");
  } catch (e) { toast(errText(e)); }
}

// Search by name or Emarni ID (partial, case-insensitive), then send a friend request.
function renderResults() {
  const ul = $("results"), term = $("search").value.trim().toLowerCase();
  ul.innerHTML = "";
  if (!term || !state.user) return;
  const found = Object.values(state.dir)
    .filter(u => u.uid !== state.user.uid &&
      (String(u.displayName).toLowerCase().includes(term) || String(u.emarniId).toLowerCase().includes(term)))
    .slice(0, 8);
  if (!found.length) return ul.append(h("li", { className: "none", textContent: "No users found." }));
  found.forEach(u => ul.append(h("li", {},
    h("div", { className: "avatar", textContent: initial(u.displayName) }),
    h("div", { className: "grow" }, h("strong", { textContent: u.displayName }), h("small", { textContent: u.emarniId })),
    actionFor(u))));
}
function actionFor(u) {
  if (state.friends[u.uid]?.status === "accepted") return h("small", { textContent: "Friends" });
  if (state.requests[u.uid]?.status === "pending") return h("button", { className: "btn sm", textContent: "Accept", onclick: () => answerRequest(u.uid, true) });
  if (state.sent.has(u.uid)) return h("small", { textContent: "Request sent" });
  return h("button", { className: "btn sm", textContent: "Add", onclick: () => addFriend(u) });
}
$("search").oninput = renderResults;

async function addFriend(u) {
  try {
    await fb.sendFriendRequest(u.uid, state.profile);
    state.sent.add(u.uid);
    renderResults();
    toast("Friend request sent to " + u.displayName);
  } catch (err) { toast(errText(err)); }
}

/* ---------- Direct messages ---------- */
async function openChat(uid) {
  const my = ++state.seq;
  state.unsubMsgs?.();
  state.unsubMsgs = null;
  state.chat = null;
  state.friendUid = uid;
  renderFriends();
  $("chatTitle").textContent = person(uid).displayName;
  $("messages").innerHTML = "";
  $("messages").append(h("p", { className: "empty", textContent: "Loading..." }));
  $("app").classList.add("chatting");
  $("composer").classList.remove("hidden");
  $("reportUser").classList.remove("hidden");
  try {
    const roomId = await fb.openPrivateChat(uid);
    if (my !== state.seq) return; // user switched chats meanwhile
    state.chat = { type: "private", id: roomId };
    state.unsubMsgs = fb.watchMessages(state.chat, renderMessages, e => toast(errText(e)));
  } catch (err) {
    if (my === state.seq) { toast(errText(err)); closeChat(); }
  }
}

function closeChat() {
  state.seq++;
  state.unsubMsgs?.();
  state.unsubMsgs = null;
  state.chat = null;
  state.friendUid = null;
  $("app").classList.remove("chatting");
  $("composer").classList.add("hidden");
  $("reportUser").classList.add("hidden");
  $("chatTitle").textContent = "Select a friend";
  $("messages").innerHTML = "";
  $("messages").append(h("p", { className: "empty", textContent: "Pick a friend to start a private chat." }));
  document.querySelectorAll("#friends li.active").forEach(li => li.classList.remove("active"));
}
$("back").onclick = closeChat;

function renderMessages(list) {
  const box = $("messages");
  const stick = !box.querySelector(".msg") || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = "";
  if (!list.length) return box.append(h("p", { className: "empty", textContent: "No messages yet. Say hello!" }));

  list.forEach(m => {
    const mine = m.uid === state.user.uid, gone = m.deleted === true;
    const time = new Date(Number(m.createdAt) || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const bubble = h("div", { className: "msg" + (mine ? " mine" : "") + (gone ? " gone" : "") },
      h("span", { textContent: gone ? "This message was deleted" : m.text }),
      h("time", { textContent: time })
    );
    if (!gone) {
      bubble.append(mine
        ? h("button", { className: "act del", title: "Delete message", textContent: "Delete", onclick: () => removeMessage(m.id) })
        : h("button", { className: "act", title: "Report message", textContent: "Report", onclick: () => openReport({ id: m.id }) }));
    }
    box.append(bubble);
  });
  if (stick) box.scrollTop = box.scrollHeight;
}

$("composer").onsubmit = async e => {
  e.preventDefault();
  const input = $("text"), text = input.value.trim();
  if (!text) return;
  if (!state.chat) return toast("Chat is still loading. Please wait a moment.");
  input.value = "";
  try { await fb.sendMessage(state.chat, text, state.profile); }
  catch (err) { input.value = text; toast(errText(err)); }
};

/* ---------- Delete (sender only) ---------- */
async function removeMessage(id) {
  if (!state.chat || !confirm("Delete this message for everyone?")) return;
  try {
    await fb.deleteMessage(state.chat, id); // the live listener then shows "This message was deleted"
    toast("Message deleted");
  } catch (e) { toast(errText(e)); }
}

/* ---------- Report (a message or a user) ---------- */
function openReport(target) {
  state.report = target;
  $("reportDlg").showModal();
}
$("reportUser").onclick = () => state.friendUid && openReport({ user: state.friendUid });
$("reportCancel").onclick = () => $("reportDlg").close();
$("reportSend").onclick = async () => {
  const target = state.report;
  if (!target || (!target.user && !state.chat)) return;
  const btn = $("reportSend");
  btn.disabled = true;
  try {
    const reason = $("reason").value;
    if (target.user) await fb.reportUser(target.user, reason);
    else await fb.reportMessage(state.chat, target.id, reason);
    toast("Report sent. Thank you!");
    $("reportDlg").close();
  } catch (e) { toast(errText(e)); }
  finally { btn.disabled = false; }
};

/* ---------- One-time safety notice ---------- */
$("noticeDlg").addEventListener("cancel", e => e.preventDefault());
$("noticeOk").onclick = async () => {
  try { await fb.acknowledgeNotice(); $("noticeDlg").close(); } catch (e) { toast(errText(e)); }
};
$("noticeOut").onclick = () => { $("noticeDlg").close(); fb.signOutAccount(); };
