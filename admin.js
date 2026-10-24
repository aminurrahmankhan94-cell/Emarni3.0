import * as fb from "./firebase.js?v=8";

const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
};

const DAY = 864e5;
const D = { dir: {}, by: {}, acc: {}, fr: {}, reports: {}, archive: {} };
let tab = "users", live = false, unsubs = [], convoUnsubs = [], userQuery = "";

const fmt = ts => (ts ? new Date(Number(ts)).toLocaleString() : "-");
const nameOf = uid => D.by[uid]?.displayName || String(uid).slice(0, 8);
const friendsOf = uid => Object.entries(D.fr[uid] || {}).filter(([, f]) => f?.status === "accepted").map(([id]) => id);
const btn = (text, onclick, cls = "btn sm") => h("button", { className: cls, textContent: text, onclick });
const table = (heads, rows) => h("table", {},
  h("thead", {}, h("tr", {}, ...heads.map(t => h("th", { textContent: t })))),
  h("tbody", {}, ...rows));
const tr = (cells, props = {}) => h("tr", props,
  ...cells.map(c => (c instanceof Node ? h("td", {}, c) : h("td", { textContent: c }))));

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 3500);
}

/* ---------- Sign in (admin accounts only) ---------- */
function showView(admin) {
  $("login").classList.toggle("hidden", admin);
  $("admin").classList.toggle("hidden", !admin);
}

$("loginForm").onsubmit = async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  try {
    await fb.signInEmail($("email").value, $("password").value);
  } catch (err) {
    $("loginError").textContent = err.code === "auth/too-many-requests" ? "Too many attempts. Try again later." : "Wrong email or password.";
  }
};
$("out").onclick = () => fb.signOutAccount();

fb.watchAuth(async user => {
  stop();
  $("loginOut").classList.add("hidden");
  $("copyUid").classList.add("hidden");
  if (!user) return showView(false);
  const status = await fb.checkAdmin(user);
  if (status !== "ok" && status !== true) {
    showView(false);
    $("loginOut").classList.remove("hidden");
    $("copyUid").classList.toggle("hidden", status === "rules");
    $("copyUid").onclick = () => copyText(user.uid);
    $("loginError").textContent = status === "rules"
      ? "Database rules are not published yet. Publish database.rules.json in the Firebase Console, then sign in again."
      : `Signed in as ${user.email}, but this account is not an admin yet. In Firebase Console > Realtime Database > Data, add a child "admins" and inside it a child named ${user.uid} with the value true (no quotes). Then reload this page.`;
    return;
  }
  $("loginError").textContent = "";
  live = true;
  showView(true);
  start();
});
function copyText(text) {
  (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => toast("UID copied"), () => prompt("Copy this UID:", text));
}
$("loginOut").onclick = () => { $("loginError").textContent = ""; fb.signOutAccount(); };

/* ---------- Live data ---------- */
function start() {
  const err = e => toast(e.message);
  unsubs.push(
    fb.watchPath("userDirectory", v => {
      D.dir = v;
      D.by = Object.fromEntries(Object.values(v).map(d => [d.uid, d]));
      render();
    }, err),
    fb.watchPath("userAccounts", v => { D.acc = v; render(); }, err),
    fb.watchPath("friendships", v => { D.fr = v; render(); }, err),
    fb.watchPath("reports", v => { D.reports = v; render(); }, err),
    fb.watchPath("moderationArchive", v => { D.archive = v; purgeOld(); render(); }, err)
  );
}

function stop() {
  live = false;
  unsubs.forEach(u => u());
  unsubs = [];
  stopConvo();
}

// Deleted-message copies are kept for 30 days, then removed.
function purgeOld() {
  const old = Object.entries(D.archive).filter(([, a]) => Date.now() - Number(a.deletedAt) > 30 * DAY).map(([k]) => k);
  if (old.length) fb.purgeArchive(old).catch(() => {});
}

/* ---------- Views ---------- */
function render() {
  if (!live) return;
  const open = Object.values(D.reports).filter(r => r.status === "open").length;
  $("repCount").textContent = open ? `(${open})` : "";
  $("view").replaceChildren(tab === "users" ? usersView() : tab === "reports" ? reportsView() : deletedView());
}

document.querySelectorAll(".tab").forEach(b => {
  b.onclick = () => {
    tab = b.dataset.t;
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x === b));
    render();
  };
});

function usersView() {
  const allUsers = Object.values(D.dir).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  const q = userQuery.trim().toLowerCase();
  const users = allUsers.filter(u => [u.displayName, u.emarniId, D.acc[u.uid]?.email, u.uid]
    .some(v => String(v || "").toLowerCase().includes(q)));
  const search = h("input", { type: "search", className: "admin-search", placeholder: "Search by name, Emarni ID, email or UID…", value: userQuery, oninput: e => {
    userQuery = e.target.value;
    render();
    const next = document.querySelector(".admin-search");
    if (next) { next.focus(); next.setSelectionRange(userQuery.length, userQuery.length); }
  }});
  const summary = h("div", { className: "admin-summary" },
    h("div", { className: "summary-card" }, h("span", { textContent: "Total users" }), h("strong", { textContent: String(allUsers.length) })),
    h("div", { className: "summary-card" }, h("span", { textContent: "Showing results" }), h("strong", { textContent: String(users.length) })),
    h("div", { className: "summary-card" }, h("span", { textContent: "Open reports" }), h("strong", { textContent: String(Object.values(D.reports).filter(r => r.status === "open").length) }))
  );
  const content = h("div", { className: "admin-users" }, summary, search);
  if (!users.length) content.append(h("p", { className: "hint empty-state", textContent: allUsers.length ? "No users match your search." : "No users yet." }));
  else content.append(table(["Name", "Emarni ID", "Email", "Friends"], users.map(u =>
    tr([u.displayName, u.emarniId, D.acc[u.uid]?.email || "-", String(friendsOf(u.uid).length)],
      { className: "click", onclick: () => userDialog(u) }))));
  return content;
}

function reportsView() {
  const list = Object.entries(D.reports).sort(([, a], [, b]) =>
    (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || Number(b.createdAt) - Number(a.createdAt));
  if (!list.length) return h("p", { className: "hint", textContent: "No reports yet." });
  return table(["Time", "Type", "Reporter", "Reported user", "Reason / message", "Status", ""], list.map(([id, r]) =>
    tr([
      fmt(r.createdAt), r.type, nameOf(r.reporterUid), nameOf(r.reportedUid),
      r.reason + (r.messageText ? ` - "${r.messageText}"` : ""),
      h("span", { className: "tag " + r.status, textContent: r.status }),
      h("div", { className: "row" },
        btn("View chat", () => convo(r.reporterUid, r.reportedUid)),
        ...(r.status === "open" ? [btn("Resolve", () => fb.resolveReport(id).catch(e => toast(e.message)))] : []))
    ])));
}

function deletedView() {
  const list = Object.values(D.archive).sort((a, b) => Number(b.deletedAt) - Number(a.deletedAt));
  if (!list.length) return h("p", { className: "hint", textContent: "No deleted messages in the last 30 days." });
  return table(["Deleted", "Sender", "Message", "Days left", ""], list.map(a => {
    const other = String(a.roomId).split("__").find(x => x !== a.uid);
    const left = Math.max(0, Math.ceil(30 - (Date.now() - Number(a.deletedAt)) / DAY));
    return tr([fmt(a.deletedAt), nameOf(a.uid), a.text, String(left), btn("View chat", () => convo(a.uid, other))]);
  }));
}

/* ---------- Dialogs ---------- */
function openDlg(title, body) {
  $("dlgTitle").textContent = title;
  $("dlgBody").replaceChildren(body);
  if (!$("dlg").open) $("dlg").showModal();
}
function stopConvo() {
  convoUnsubs.forEach(u => u());
  convoUnsubs = [];
}
$("dlgClose").onclick = () => $("dlg").close();
$("dlg").addEventListener("close", stopConvo);

function userDialog(u) {
  const email = D.acc[u.uid]?.email;
  const body = h("div", {},
    h("p", { textContent: `Emarni ID: ${u.emarniId}` }),
    h("p", { textContent: `Email: ${email || "-"}` }),
    h("p", { textContent: `UID: ${u.uid}` }),
    h("p", { textContent: `Joined: ${fmt(u.createdAt)}` }));
  if (email) {
    body.append(h("p", { className: "hint reset-note", textContent: "For security, existing passwords are never visible to admins. Send a reset link so the user can create a new password." }));
    body.append(btn("Send password reset email", () =>
      fb.sendResetEmail(email).then(() => toast("Password reset email sent"), e => toast(e.message)), "btn sm"));
  }
  body.append(h("h3", { textContent: "Friends" }));
  const ul = h("ul", { className: "list" });
  friendsOf(u.uid).forEach(fid => ul.append(h("li", {},
    h("div", { className: "grow" }, h("strong", { textContent: nameOf(fid) }), h("small", { textContent: D.by[fid]?.emarniId || fid })),
    btn("View chat", () => convo(u.uid, fid)))));
  if (!ul.children.length) ul.append(h("li", { className: "none", textContent: "No friends yet" }));
  body.append(ul);
  openDlg(u.displayName, body);
}

// Live conversation between two users, including deleted messages kept for 30 days.
function convo(a, b) {
  stopConvo();
  const roomId = fb.roomIdFor(a, b);
  fb.logAdminView(roomId).catch(() => {});
  const box = h("div", { className: "convo" });
  openDlg(`${nameOf(a)} & ${nameOf(b)}`, box);
  let msgs = [], gone = {};
  const draw = () => {
    const ids = new Set(msgs.map(m => m.id));
    const all = [...msgs, ...Object.values(gone).filter(g => !ids.has(g.messageId)).map(g => ({ ...g, id: g.messageId, del: true }))]
      .sort((x, y) => (Number(x.createdAt) || 0) - (Number(y.createdAt) || 0));
    box.replaceChildren(...(all.length
      ? all.map(m => h("div", { className: "msg" + (m.uid === a ? " mine" : "") + (m.del ? " gone-admin" : "") },
        h("small", { textContent: nameOf(m.uid) + (m.del ? " - deleted by user" : "") }),
        h("span", { textContent: m.deleted ? "(deleted)" : m.text }),
        h("time", { textContent: fmt(m.createdAt) })))
      : [h("p", { className: "empty", textContent: "No messages." })]));
    box.scrollTop = box.scrollHeight;
  };
  const err = e => toast(e.message);
  convoUnsubs = [
    fb.watchMessages({ id: roomId }, l => { msgs = l; draw(); }, err),
    fb.watchRoomArchive(roomId, v => { gone = v; draw(); }, err)
  ];
}
