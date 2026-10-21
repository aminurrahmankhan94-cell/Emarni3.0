import {
  watchAuth,
  getCurrentUser,
  registerAccount,
  signInAccount,
  signOutAccount,
  ensureUserProfile,
  saveUserProfile,
  uploadAvatar,
  watchUserDirectory,
  watchFriendships,
  watchIncomingRequests,
  sendFriendRequest,
  respondFriendRequest,
  openPrivateChat,
  createChatGroup,
  watchMyGroups,
  watchMessages,
  sendChatMessage,
  deleteChatMessage,
  reportChatMessage,
  resolveModerationReport,
  checkAdminRole,
  watchModerationArchive,
  watchModerationReports,
  watchBannedUsers,
  setUserBan
} from "./firebase.js";

const $ = id => document.getElementById(id);

const state = {
  user: null,
  profile: null,
  isAdmin: false,
  directory: {},
  friendships: {},
  requests: {},
  groups: [],
  messages: [],
  archive: {},
  reports: {},
  banned: {},
  activeChat: {
    type: "global",
    id: "global",
    title: "Global Lounge",
    subtitle: "Join the conversation with the Emarni community."
  },
  activeView: "global",
  authMode: "signin",
  unsubscribers: [],
  messageUnsubscribe: null,
  archiveUnsubscribe: null,
  bannedUnsubscribe: null,
  reportsUnsubscribe: null,
  toastTimer: null,
  adminTab: "users"
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const el = (tag, className = "", text = undefined) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3600);
}

function connection(status, label) {
  $("connectionText").textContent = label;

  const dot = $("connectionIndicator");

  dot.classList.toggle("connected", status === "connected");
  dot.classList.toggle("offline", status === "offline");
}

function setAuthMode(mode) {
  state.authMode = mode;

  const signup = mode === "signup";

  $("signupNameWrap").classList.toggle("hidden", !signup);
  $("signupName").required = signup;

  $("authTitle").textContent = signup
    ? "Create your account"
    : "Welcome back";

  $("authLoginLabel").childNodes[0].textContent = signup
    ? "Email address"
    : "Emarni ID or email";

  $("authEmail").placeholder = signup
    ? "you@example.com"
    : "EM12345678 or you@example.com";

  $("authEmail").autocomplete = signup ? "email" : "username";

  $("authSubtitle").textContent = signup
    ? "Create your Emarni ID and start connecting."
    : "Sign in to continue your conversations.";

  $("authSubmit").innerHTML = signup
    ? 'Create account <span class="button-arrow">→</span>'
    : 'Sign in <span class="button-arrow">→</span>';

  $("authSwitchText").textContent = signup
    ? "Already have an account?"
    : "New to Emarni?";

  $("authSwitch").textContent = signup
    ? "Sign in"
    : "Create an account";

  $("authPassword").autocomplete = signup
    ? "new-password"
    : "current-password";
}

function friendlyAuthError(error) {
  const code = error?.code || "";

  const messages = {
    "auth/email-already-in-use":
      "An account already uses this email address. Try signing in.",
    "auth/invalid-email":
      "Enter a valid email address.",
    "auth/weak-password":
      "Choose a stronger password with at least 8 characters.",
    "auth/invalid-credential":
      "The email or password is not correct.",
    "auth/user-not-found":
      "No account was found for that email address.",
    "auth/wrong-password":
      "The email or password is not correct.",
    "auth/too-many-requests":
      "Too many attempts. Please try again later.",
    "auth/network-request-failed":
      "Network problem. Check your internet connection.",
    "permission-denied":
      "Firebase permissions blocked this action. Deploy the included security rules and check the Firebase setup."
  };

  return messages[code] ||
    error?.message ||
    "Something went wrong. Please try again.";
}

function renderAvatar(target, name, photoURL, className = "") {
  target.replaceChildren();

  if (className) {
    target.className = className;
  }

  if (photoURL) {
    const image = el("img");

    image.src = photoURL;
    image.alt = `${name || "User"} profile`;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";

    image.onerror = () => {
      target.replaceChildren(
        document.createTextNode(
          (name || "E").charAt(0).toUpperCase()
        )
      );
    };

    target.appendChild(image);
  } else {
    target.textContent =
      (name || "E").trim().charAt(0).toUpperCase() || "E";
  }
}

function updateProfileUI() {
  const profile = state.profile || {};

  $("profileName").textContent =
    profile.displayName || "Your profile";

  $("profileEmarniId").textContent = profile.emarniId
    ? `@${profile.emarniId}`
    : "Creating your ID...";

  renderAvatar(
    $("profileAvatar"),
    profile.displayName,
    profile.photoURL,
    "avatar avatar-large"
  );

  renderAvatar(
    $("profilePreview"),
    profile.displayName,
    profile.photoURL,
    "avatar avatar-xl"
  );
}

function updateRequestCount() {
  const count = Object.values(state.requests || {})
    .filter(request => request?.status === "pending")
    .length;

  $("requestCount").textContent = String(count);
  $("requestCount").classList.toggle("hidden", count < 1);
}

function publicProfileByUid(uid) {
  return Object.values(state.directory)
    .find(item => item?.uid === uid) || null;
}

function sortedFriends() {
  return Object.entries(state.friendships || {})
    .filter(([, value]) => value?.status === "accepted")
    .map(([uid]) => ({
      uid,
      profile: publicProfileByUid(uid)
    }))
    .filter(entry => Boolean(entry.profile))
    .sort((a, b) =>
      (a.profile.displayName || "")
        .localeCompare(b.profile.displayName || "")
    );
}

function changeView(view) {
  if (view === "global") {
    activateChat({
      type: "global",
      id: "global",
      title: "Global Lounge",
      subtitle: "Join the conversation with the Emarni community."
    });
    return;
  }

  if (view === "support") {
    activateChat({
      type: "support",
      id: "support",
      title: "Mood Support",
      subtitle: "A calm community space to talk and listen."
    });
    return;
  }

  state.activeView = view;

  if (state.messageUnsubscribe) {
    state.messageUnsubscribe();
    state.messageUnsubscribe = null;
  }

  $("chatWorkspace").classList.add("hidden");
  $("contentPanel").classList.remove("hidden");
  $("chatSearchStrip").classList.add("hidden");
  $("chatSearchInput").value = "";

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  document.querySelectorAll(".group-nav-item").forEach(button => {
    button.classList.remove("active");
  });

  $("sidebar").classList.remove("open");

  if (view === "discover") {
    renderDiscoverPanel();
  } else if (view === "requests") {
    renderRequestsPanel();
  } else if (view === "friends") {
    renderFriendsPanel();
  } else {
    renderDiscoverPanel();
  }
}

function activateChat(chat) {
  state.activeChat = chat;
  state.activeView = chat.type;
  state.messages = [];

  if (state.messageUnsubscribe) {
    state.messageUnsubscribe();
  }

  state.messageUnsubscribe = null;

  $("contentPanel").classList.add("hidden");
  $("chatWorkspace").classList.remove("hidden");
  $("chatSearchStrip").classList.add("hidden");
  $("chatSearchInput").value = "";

  $("viewTitle").textContent = chat.title;

  $("viewSubtitle").textContent =
    chat.subtitle || "A place to share thoughtful messages.";

  $("headerOverline").textContent =
    chat.type === "private"
      ? "PRIVATE CONVERSATION"
      : chat.type === "group"
      ? (
          chat.groupType === "business"
            ? "BUSINESS GROUP"
            : "GROUP CONVERSATION"
        )
      : chat.type === "support"
      ? "COMMUNITY SUPPORT"
      : "COMMUNITY CHAT";

  $("roomTypeBadge").textContent =
    chat.type === "private"
      ? "FRIENDS ONLY"
      : chat.type === "group"
      ? (
          chat.groupType === "business"
            ? "BUSINESS GROUP"
            : "GROUP CHAT"
        )
      : chat.type === "support"
      ? "SUPPORT LOUNGE"
      : "PUBLIC ROOM";

  $("conversationLabel").textContent =
    chat.type === "private"
      ? "PRIVATE MESSAGES"
      : chat.type === "group"
      ? "GROUP MESSAGES"
      : chat.type === "support"
      ? "SUPPORT CONVERSATION"
      : "LATEST MESSAGES";

  $("welcomeBanner").classList.toggle(
    "hidden",
    !["global", "support"].includes(chat.type)
  );

  if (chat.type === "support") {
    const title = $("welcomeBanner").querySelector("h2");
    const copy = $("welcomeBanner").querySelector("p:not(.eyebrow)");

    title.innerHTML = "You do not have<br />to feel alone.";

    copy.textContent =
      "Share what is on your mind, listen without judgement, and remember to protect your personal information.";

    $("welcomeBanner").querySelector(".eyebrow").textContent =
      "A SPACE TO TALK AND LISTEN";

    $("welcomeHelloBtn").firstChild.textContent = "Start talking ";
  } else if (chat.type === "global") {
    const title = $("welcomeBanner").querySelector("h2");
    const copy = $("welcomeBanner").querySelector("p:not(.eyebrow)");

    title.innerHTML = "Every conversation<br />can make a difference.";

    copy.textContent =
      "Say hello, meet new people, or take a moment to talk with someone.";

    $("welcomeBanner").querySelector(".eyebrow").textContent =
      "A LITTLE KINDNESS MATTERS";

    $("welcomeHelloBtn").firstChild.textContent =
      "Join the conversation ";
  }

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === chat.type
    );
  });

  document.querySelectorAll(".group-nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      chat.type === "group" && button.dataset.groupId === chat.id
    );
  });

  $("sidebar").classList.remove("open");

  renderMessages();
  connection("connecting", "Opening conversation");

  state.messageUnsubscribe = watchMessages(
    chat,
    messages => {
      state.messages = messages;

      if (["global", "support"].includes(chat.type)) {
        $("welcomeBanner").classList.toggle(
          "hidden",
          messages.length > 0
        );
      }

      renderMessages();
      connection("connected", "Connected");
    },
    error => {
      console.error("Message subscription failed:", error);
      connection("offline", "Connection issue");

      showToast(
        "Could not load this conversation. Check your Firebase rules and deployment."
      );
    }
  );
}

function formatTime(value) {
  if (!value) return "just now";

  const date = new Date(Number(value));

  if (Number.isNaN(date.getTime())) return "just now";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
function createMessageRow(message) {
  const mine = Boolean(state.user && message.uid === state.user.uid);
  const row = el("article", `message-row${mine ? " mine" : ""}`);
  const avatar = el("div", "message-avatar");

  renderAvatar(
    avatar,
    message.senderName || "User",
    message.senderPhotoURL || "",
    "message-avatar"
  );

  const content = el("div", "message-content");
  const meta = el("div", "message-meta");

  meta.append(
    el("strong", "", mine ? "You" : (message.senderName || "Emarni user")),
    el("span", "message-time", formatTime(message.createdAt))
  );

  const bubble = el(
    "div",
    `message-bubble${message.deleted ? " deleted-bubble" : ""}`,
    message.deleted ? "This message was deleted." : (message.text || "")
  );

  content.append(meta, bubble);

  if (!message.deleted) {
    const actions = el("div", "message-actions");

    if (mine) {
      const removeButton = el(
        "button",
        "message-action",
        "Delete message"
      );

      removeButton.type = "button";

      removeButton.addEventListener("click", async () => {
        if (!window.confirm(
          "Delete this message? It will no longer be visible in chat. Moderation records may be retained for up to 30 days."
        )) return;

        removeButton.disabled = true;

        try {
          await deleteChatMessage(state.activeChat, message.id);
          showToast("Message deleted.");
        } catch (error) {
          console.error(error);
          showToast(friendlyAuthError(error));
          removeButton.disabled = false;
        }
      });

      actions.appendChild(removeButton);
    } else {
      const reportButton = el("button", "message-action", "Report");
      reportButton.type = "button";

      reportButton.addEventListener("click", async () => {
        const reason = window.prompt(
          "Briefly explain why you are reporting this message:"
        );

        if (reason === null) return;

        if (reason.trim().length < 3) {
          return showToast(
            "Add a short reason so the moderation team can review it."
          );
        }

        reportButton.disabled = true;

        try {
          await reportChatMessage(
            state.activeChat,
            message.id,
            reason.trim().slice(0, 200)
          );

          showToast("Report sent to the moderation team.");
        } catch (error) {
          console.error(error);
          showToast(friendlyAuthError(error));
          reportButton.disabled = false;
        }
      });

      actions.appendChild(reportButton);
    }

    if (actions.childElementCount) {
      content.appendChild(actions);
    }
  }

  row.append(avatar, content);
  return row;
}

function renderMessages() {
  const queryText = $("chatSearchInput").value.trim().toLowerCase();

  const filtered = state.messages.filter(message =>
    !queryText ||
    String(message.text || "").toLowerCase().includes(queryText) ||
    String(message.senderName || "").toLowerCase().includes(queryText)
  );

  $("messagesList").replaceChildren();

  const fragment = document.createDocumentFragment();

  for (const message of filtered) {
    fragment.appendChild(createMessageRow(message));
  }

  $("messagesList").appendChild(fragment);

  $("emptyMessages").classList.toggle(
    "hidden",
    state.messages.length > 0 || Boolean(queryText)
  );

  $("emptySearch").classList.toggle(
    "hidden",
    !queryText || filtered.length > 0
  );

  $("messagesArea").scrollTop = $("messagesArea").scrollHeight;
}

function updateCharacterCount() {
  $("charCount").textContent =
    `${$("messageInput").value.length} / 1000`;

  $("messageInput").style.height = "auto";

  $("messageInput").style.height =
    `${Math.min($("messageInput").scrollHeight, 120)}px`;
}

async function sendCurrentMessage(event) {
  event?.preventDefault();

  const text = $("messageInput").value.trim();

  if (!text) return;

  if (!state.user || !state.profile) {
    showToast("Sign in before sending messages.");
    return;
  }

  $("sendBtn").disabled = true;

  try {
    await sendChatMessage(state.activeChat, text, state.profile);

    $("messageInput").value = "";
    updateCharacterCount();
    $("messageInput").focus();
  } catch (error) {
    console.error(error);
    showToast(friendlyAuthError(error));
  } finally {
    $("sendBtn").disabled = false;
  }
}

function panelHeading(title, description) {
  const heading = el("div", "panel-heading");
  const copy = el("div");

  copy.append(
    el("h2", "", title),
    el("p", "", description)
  );

  heading.appendChild(copy);
  return heading;
}

function renderDiscoverPanel() {
  const panel = $("contentPanel");

  panel.replaceChildren(
    panelHeading(
      "Find people",
      "Search by Emarni ID or display name. A private conversation becomes available after a friend request is accepted."
    )
  );

  const searchWrap = el("div", "panel-search");
  const input = el("input");

  input.type = "search";
  input.placeholder = "Search name or Emarni ID, e.g. EM12345678";
  input.setAttribute("aria-label", "Search people");

  searchWrap.appendChild(input);
  panel.appendChild(searchWrap);

  const grid = el("div", "panel-grid");
  panel.appendChild(grid);

  const draw = () => {
    grid.replaceChildren();

    const term = input.value.trim().toLowerCase();

    const candidates = Object.values(state.directory)
      .filter(user => user?.uid && user.uid !== state.user?.uid)
      .filter(user =>
        !term ||
        `${user.displayName || ""} ${user.emarniId || ""} ${user.bio || ""}`
          .toLowerCase()
          .includes(term)
      )
      .sort((a, b) =>
        (a.displayName || "").localeCompare(b.displayName || "")
      );

    if (!candidates.length) {
      grid.appendChild(
        el(
          "div",
          "empty-panel",
          term
            ? "No users match that search. Check the Emarni ID and try again."
            : "No other users are listed yet. Share your Emarni ID with friends so they can find you."
        )
      );
      return;
    }

    candidates.forEach(user => {
      const card = el("article", "person-card");
      const avatar = el("div", "avatar avatar-large");

      renderAvatar(
        avatar,
        user.displayName,
        user.photoURL,
        "avatar avatar-large"
      );

      const details = el("div", "person-info");

      details.append(
        el("strong", "", user.displayName || "Emarni user"),
        el("span", "", `@${user.emarniId || "ID pending"}`)
      );

      if (user.bio) {
        details.appendChild(el("p", "", user.bio));
      }

      const friend =
        state.friendships[user.uid]?.status === "accepted";

      const requestPending =
        Boolean(state.requests[user.uid]?.status === "pending");

      const action = el(
        "button",
        `small-btn${friend ? " neutral" : ""}`,
        friend
          ? "Friends"
          : requestPending
          ? "Request received"
          : "Add friend"
      );

      action.type = "button";
      action.disabled = friend || requestPending;

      if (!action.disabled) {
        action.addEventListener("click", async () => {
          action.disabled = true;
          action.textContent = "Sending...";

          try {
            await sendFriendRequest(user.uid, state.profile);

            showToast(
              `Friend request sent to ${user.displayName || "this user"}.`
            );

            action.textContent = "Request sent";
          } catch (error) {
            showToast(friendlyAuthError(error));
            action.textContent = "Add friend";
            action.disabled = false;
          }
        });
      }

      card.append(avatar, details, action);
      grid.appendChild(card);
    });
  };

  input.addEventListener("input", draw);
  draw();
}

function renderRequestsPanel() {
  const panel = $("contentPanel");

  panel.replaceChildren(
    panelHeading(
      "Friend requests",
      "Accept a request to allow private messages between both accounts."
    )
  );

  const grid = el("div", "panel-grid");
  panel.appendChild(grid);

  const pending = Object.entries(state.requests)
    .filter(([, request]) => request?.status === "pending");

  if (!pending.length) {
    grid.appendChild(
      el(
        "div",
        "empty-panel",
        "You have no pending friend requests. New requests will appear here."
      )
    );
    return;
  }

  pending.forEach(([requesterUid, request]) => {
    const user = publicProfileByUid(requesterUid) || {
      displayName: request.fromName || "Emarni user",
      emarniId: request.fromEmarniId || "",
      bio: ""
    };

    const card = el("article", "request-card");
    const avatar = el("div", "avatar avatar-large");

    renderAvatar(
      avatar,
      user.displayName,
      user.photoURL,
      "avatar avatar-large"
    );

    const details = el("div", "person-info");

    details.append(
      el("strong", "", user.displayName),
      el("span", "", `@${user.emarniId || "ID unavailable"}`)
    );

    const actions = el("div", "card-action-stack");
    const accept = el("button", "small-btn", "Accept");
    const decline = el("button", "small-btn neutral", "Decline");

    accept.type = decline.type = "button";

    accept.addEventListener("click", async () => {
      accept.disabled = decline.disabled = true;

      try {
        await respondFriendRequest(requesterUid, true);

        showToast(`You and ${user.displayName} are now friends.`);
        renderRequestsPanel();
      } catch (error) {
        showToast(friendlyAuthError(error));
        accept.disabled = decline.disabled = false;
      }
    });

    decline.addEventListener("click", async () => {
      accept.disabled = decline.disabled = true;

      try {
        await respondFriendRequest(requesterUid, false);

        showToast("Friend request declined.");
        renderRequestsPanel();
      } catch (error) {
        showToast(friendlyAuthError(error));
        accept.disabled = decline.disabled = false;
      }
    });

    actions.append(accept, decline);

    card.append(
      avatar,
      details,
      actions,
      el("p", "request-copy", "Accept only if you recognise or trust this person.")
    );

    grid.appendChild(card);
  });
}

async function startDirectChat(uid, displayName) {
  try {
    const roomId = await openPrivateChat(uid);

    activateChat({
      type: "private",
      id: roomId,
      title: displayName || "Private chat",
      subtitle: "Messages in this conversation are for its participants."
    });
  } catch (error) {
    console.error(error);
    showToast(friendlyAuthError(error));
  }
}
function renderFriendsPanel() {
  const panel = $("contentPanel");

  panel.replaceChildren(
    panelHeading(
      "Your friends",
      "Only accepted friends can open private conversations with you."
    )
  );

  const grid = el("div", "panel-grid");
  panel.appendChild(grid);

  const friends = sortedFriends();

  if (!friends.length) {
    grid.appendChild(
      el(
        "div",
        "empty-panel",
        "You have no accepted friends yet. Open Find people to send a friend request."
      )
    );
    return;
  }

  friends.forEach(({ uid, profile }) => {
    const card = el("article", "friend-card");
    const avatar = el("div", "avatar avatar-large");

    renderAvatar(
      avatar,
      profile.displayName,
      profile.photoURL,
      "avatar avatar-large"
    );

    const details = el("div", "person-info");

    details.append(
      el("strong", "", profile.displayName || "Emarni user"),
      el("span", "", `@${profile.emarniId || "ID unavailable"}`)
    );

    if (profile.bio) {
      details.appendChild(el("p", "", profile.bio));
    }

    const action = el("button", "small-btn", "Message");
    action.type = "button";

    action.addEventListener("click", () =>
      startDirectChat(uid, profile.displayName)
    );

    card.append(avatar, details, action);
    grid.appendChild(card);
  });
}

function renderGroupList() {
  const target = $("groupsList");
  target.replaceChildren();

  if (!state.groups.length) {
    target.appendChild(
      el("p", "subtle-empty", "Your groups will appear here.")
    );
    return;
  }

  state.groups.forEach(group => {
    const button = el(
      "button",
      `group-nav-item${
        state.activeChat.type === "group" &&
        state.activeChat.id === group.id
          ? " active"
          : ""
      }`
    );

    button.type = "button";
    button.dataset.groupId = group.id;

    button.append(
      el("span", "group-type-mark", group.type === "business" ? "B" : "G"),
      el("span", "group-nav-name", group.name || "Untitled group")
    );

    button.addEventListener("click", () => {
      activateChat({
        type: "group",
        id: group.id,
        title: group.name || "Group chat",
        subtitle:
          group.description ||
          (
            group.type === "business"
              ? (group.companyName || "Business group")
              : "A shared group conversation."
          ),
        groupType: group.type
      });
    });

    target.appendChild(button);
  });
}

function openCreateGroupDialog() {
  $("groupForm").reset();
  $("businessGroupFields").classList.add("hidden");

  const picker = $("groupFriendPicker");
  picker.replaceChildren();

  const friends = sortedFriends();

  if (!friends.length) {
    picker.appendChild(
      el(
        "p",
        "field-help",
        "You can create a group now and invite accepted friends later."
      )
    );
  } else {
    friends.forEach(({ uid, profile }) => {
      const label = el("label", "friend-check");
      const checkbox = el("input");

      checkbox.type = "checkbox";
      checkbox.value = uid;
      checkbox.name = "groupMember";

      label.append(
        checkbox,
        el("span", "", `${profile.displayName} (@${profile.emarniId})`)
      );

      picker.appendChild(label);
    });
  }

  $("groupDialog").showModal();
}

async function handleCreateGroup(event) {
  event.preventDefault();

  const name = $("groupName").value.trim();

  if (name.length < 2) {
    return showToast("Enter a group name with at least 2 characters.");
  }

  const memberUids = [
    ...document.querySelectorAll(
      'input[name="groupMember"]:checked'
    )
  ].map(input => input.value);

  const type = $("groupType").value;
  const website = $("businessWebsite").value.trim();

  if (website && type === "business") {
    try {
      new URL(website);
    } catch {
      return showToast(
        "Enter a valid business website URL, including https://."
      );
    }
  }

  const submit = $("groupForm").querySelector(
    'button[type="submit"]'
  );

  submit.disabled = true;

  try {
    const groupId = await createChatGroup({
      name,
      type,
      description: $("groupAbout").value.trim(),
      companyName:
        type === "business"
          ? $("businessName").value.trim()
          : "",
      website: type === "business" ? website : "",
      memberUids
    });

    $("groupDialog").close();

    showToast(
      type === "business"
        ? "Business group created."
        : "Group created."
    );

    await sleep(300);

    const group = state.groups.find(item => item.id === groupId);

    if (group) {
      activateChat({
        type: "group",
        id: group.id,
        title: group.name,
        subtitle: group.description || "A shared group conversation.",
        groupType: group.type
      });
    }
  } catch (error) {
    console.error(error);
    showToast(friendlyAuthError(error));
  } finally {
    submit.disabled = false;
  }
}

function openProfileDialog() {
  const profile = state.profile || {};

  $("profileNameInput").value = profile.displayName || "";
  $("profileBioInput").value = profile.bio || "";
  $("profilePhoto").value = "";

  renderAvatar(
    $("profilePreview"),
    profile.displayName,
    profile.photoURL,
    "avatar avatar-xl"
  );

  $("profileDialog").showModal();
}

async function handleProfileSave(event) {
  event.preventDefault();

  const name = $("profileNameInput").value.trim();

  if (name.length < 2) {
    return showToast(
      "Your display name must have at least 2 characters."
    );
  }

  const submit = $("profileForm").querySelector(
    'button[type="submit"]'
  );

  submit.disabled = true;

  try {
    let photoURL = state.profile?.photoURL || "";
    const photo = $("profilePhoto").files[0];

    if (photo) {
      photoURL = await uploadAvatar(photo);
    }

    state.profile = await saveUserProfile({
      displayName: name,
      bio: $("profileBioInput").value,
      photoURL
    });

    updateProfileUI();
    $("profileDialog").close();
    showToast("Your profile has been updated.");
  } catch (error) {
    console.error(error);
    showToast(friendlyAuthError(error));
  } finally {
    submit.disabled = false;
  }
}

function updateAdminSummary() {
  const openReports = Object.values(state.reports || {})
    .filter(report => report?.status !== "reviewed").length;

  $("adminStatsUsers").textContent = String(Object.keys(state.directory || {}).length);
  $("adminStatsReports").textContent = String(openReports);
  const activeArchiveCount = Object.values(state.archive || {})
    .filter(item => Number(item?.expiresAt) > Date.now()).length;
  $("adminStatsDeleted").textContent = String(activeArchiveCount);
  $("adminStatsBanned").textContent = String(Object.keys(state.banned || {}).length);
}

function renderAdminUsers() {
  const target = $("adminUsersList");
  target.replaceChildren();

  const term = $("adminUserSearch").value.trim().toLowerCase();

  const users = Object.values(state.directory)
    .filter(user =>
      user?.uid &&
      (
        !term ||
        `${user.emarniId || ""} ${user.displayName || ""} ${user.uid}`
          .toLowerCase()
          .includes(term)
      )
    )
    .sort((a, b) =>
      (a.displayName || "").localeCompare(b.displayName || "")
    );

  if (!users.length) {
    target.appendChild(
      el("p", "subtle-empty", "No matching user was found.")
    );
    return;
  }

  users.slice(0, 150).forEach(user => {
    const row = el("div", "admin-user-row");
    const avatar = el("div", "avatar");

    avatar.style.width = "34px";
    avatar.style.height = "34px";

    renderAvatar(
      avatar,
      user.displayName,
      user.photoURL,
      "avatar"
    );

    const info = el("div", "person-info");

    info.append(
      el("strong", "", user.displayName || "Emarni user"),
      el(
        "span",
        "",
        `@${user.emarniId || "ID unavailable"} · ${user.uid}`
      )
    );

    const isBanned = Boolean(state.banned[user.uid]);

    const action = el(
      "button",
      `small-btn${isBanned ? " neutral" : " danger"}`,
      isBanned ? "Unban" : "Ban user"
    );

    action.type = "button";

    action.addEventListener("click", async () => {
      const actionLabel = isBanned ? "unban" : "ban";

      if (!window.confirm(
        `Are you sure you want to ${actionLabel} ${
          user.displayName || "this user"
        }?`
      )) return;

      action.disabled = true;

      try {
        await setUserBan(user.uid, !isBanned);

        showToast(
          isBanned
            ? "User access restored."
            : "User banned from protected app actions."
        );
      } catch (error) {
        showToast(friendlyAuthError(error));
        action.disabled = false;
      }
    });

    row.append(avatar, info, action);
    target.appendChild(row);
  });
}

function renderAdminArchive() {
  const target = $("adminDeletedList");
  target.replaceChildren();

  const rows = Object.entries(state.archive || {})
    .map(([id, item]) => ({ id, ...item }))
    .filter(item => Number(item.expiresAt) > Date.now())
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

  if (!rows.length) {
    target.appendChild(
      el(
        "p",
        "subtle-empty",
        "There are no deleted-message moderation records yet."
      )
    );
    return;
  }

  rows.forEach(item => {
    const row = el("article", "archive-row");
    const meta = el("div", "archive-meta");

    const roomLabel =
      item.roomType === "private"
        ? "Private chat"
        : item.roomType === "group"
        ? "Group chat"
        : item.roomType === "support"
        ? "Mood Support"
        : "Global Lounge";

    meta.append(
      el("span", "", roomLabel),
      el("span", "", `Sender: ${item.message?.senderName || "Unknown"}`),
      el("span", "", `Deleted: ${formatDateTime(item.deletedAt)}`),
      el("span", "", `Expires: ${formatDateTime(item.expiresAt)}`)
    );

    row.append(
      meta,
      el(
        "div",
        "archive-body",
        item.message?.text || "No message text stored."
      )
    );

    const detail = el(
      "p",
      "field-help",
      `Sender UID: ${item.message?.uid || "unknown"} · Message ID: ${item.messageId || item.id}`
    );

    row.appendChild(detail);
    target.appendChild(row);
  });
}

function renderAdminReports() {
  const target = $("adminReportsList");
  if (!target) return;

  target.replaceChildren();

  const rows = Object.entries(state.reports || {})
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!rows.length) {
    target.appendChild(
      el("p", "subtle-empty", "No message reports have been submitted.")
    );
    return;
  }

  rows.forEach(item => {
    const row = el("article", "archive-row");
    const meta = el("div", "archive-meta");

    const roomLabel =
      item.roomType === "private"
        ? "Private chat"
        : item.roomType === "group"
        ? "Group chat"
        : item.roomType === "support"
        ? "Mood Support"
        : "Global Lounge";

    meta.append(
      el("span", "", roomLabel),
      el("span", "", `Reported: ${formatDateTime(item.createdAt)}`),
      el("span", "", `Status: ${item.status || "open"}`)
    );

    row.append(
      meta,
      el(
        "div",
        "archive-body",
        item.message?.text || "Message text is unavailable."
      )
    );

    row.appendChild(
      el(
        "p",
        "field-help",
        `Reason: ${item.reason || "Not provided"} · Reporter UID: ${item.reporterUid || "unknown"} · Reported user UID: ${item.message?.uid || "unknown"}`
      )
    );

    if (item.status !== "reviewed") {
      const actions = el("div", "admin-row-actions");

      const ban = el("button", "small-btn danger", "Ban reported user");
      ban.type = "button";

      ban.addEventListener("click", async () => {
        const targetUid = item.message?.uid;

        if (!targetUid || targetUid === state.user?.uid) {
          return showToast(
            "This account cannot be banned from this report."
          );
        }

        if (!window.confirm(
          "Ban the user who sent this reported message?"
        )) return;

        ban.disabled = true;

        try {
          await setUserBan(targetUid, true);
          showToast("Reported user banned.");
        } catch (error) {
          showToast(friendlyAuthError(error));
          ban.disabled = false;
        }
      });

      const review = el(
        "button",
        "small-btn neutral",
        "Mark reviewed"
      );

      review.type = "button";

      review.addEventListener("click", async () => {
        review.disabled = true;

        try {
          await resolveModerationReport(item.id);
          showToast("Report marked as reviewed.");
        } catch (error) {
          showToast(friendlyAuthError(error));
          review.disabled = false;
        }
      });

      actions.append(ban, review);
      row.appendChild(actions);
    }

    target.appendChild(row);
  });
}

function formatDateTime(value) {
  if (!value) return "unknown";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(Number(value)));
}

function setAdminTab(tab) {
  state.adminTab = tab;

  document.querySelectorAll(".admin-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.adminTab === tab);
  });

  $("adminUsersView").classList.toggle("hidden", tab !== "users");
  $("adminReportsView").classList.toggle("hidden", tab !== "reports");
  $("adminDeletedView").classList.toggle("hidden", tab !== "deleted");
}

function openAdminConsole() {
  if (!state.isAdmin) {
    showToast(
      "This console is restricted to approved administrator accounts."
    );
    return;
  }

  $("adminUserSearch").value = "";
  setAdminTab("users");
  renderAdminUsers();
  renderAdminArchive();
  updateAdminSummary();

  if (state.archiveUnsubscribe) state.archiveUnsubscribe();
  if (state.bannedUnsubscribe) state.bannedUnsubscribe();
  if (state.reportsUnsubscribe) state.reportsUnsubscribe();

  state.archiveUnsubscribe = watchModerationArchive(
    data => {
      state.archive = data;
      renderAdminArchive();
      updateAdminSummary();
    },
    error => showToast(friendlyAuthError(error))
  );

  state.bannedUnsubscribe = watchBannedUsers(
    data => {
      state.banned = data;
      renderAdminUsers();
      updateAdminSummary();
    },
    error => showToast(friendlyAuthError(error))
  );

  state.reportsUnsubscribe = watchModerationReports(
    data => {
      state.reports = data;
      renderAdminReports();
      updateAdminSummary();
    },
    error => showToast(friendlyAuthError(error))
  );

  $("adminDialog").showModal();
}
function unsubscribeAll() {
  state.unsubscribers.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch {
      // Ignore stale listeners during sign-out.
    }
  });

  state.unsubscribers = [];

  if (state.messageUnsubscribe) state.messageUnsubscribe();
  state.messageUnsubscribe = null;

  if (state.archiveUnsubscribe) state.archiveUnsubscribe();
  if (state.bannedUnsubscribe) state.bannedUnsubscribe();
  if (state.reportsUnsubscribe) state.reportsUnsubscribe();

  state.archiveUnsubscribe =
    state.bannedUnsubscribe =
    state.reportsUnsubscribe = null;
}

async function enterApp(user) {
  if (state.user?.uid === user.uid && state.profile) return;

  unsubscribeAll();
  state.user = user;

  connection("connecting", "Loading your account");

  try {
    state.profile = await ensureUserProfile(
      user,
      user.displayName || ""
    );

    state.isAdmin = await checkAdminRole(user).catch(() => false);

    updateProfileUI();

    $("adminOpenBtn").classList.toggle("hidden", !state.isAdmin);
    $("authScreen").classList.add("hidden");
    $("appLayout").classList.remove("hidden");

    state.unsubscribers.push(
      watchUserDirectory(
        data => {
          state.directory = data;

          if (state.activeView === "discover") renderDiscoverPanel();
          if (state.activeView === "requests") renderRequestsPanel();
          if (state.activeView === "friends") renderFriendsPanel();

          if (state.isAdmin) updateAdminSummary();
          if (state.isAdmin && $("adminDialog").open) {
            renderAdminUsers();
          }
        },
        error => {
          console.error(error);
          connection("offline", "Profile sync issue");
        }
      )
    );

    state.unsubscribers.push(
      watchFriendships(
        user.uid,
        data => {
          state.friendships = data;

          if (state.activeView === "friends") {
            renderFriendsPanel();
          }
        },
        error => console.error(error)
      )
    );

    state.unsubscribers.push(
      watchIncomingRequests(
        user.uid,
        data => {
          state.requests = data;
          updateRequestCount();

          if (state.activeView === "requests") renderRequestsPanel();
          if (state.activeView === "discover") renderDiscoverPanel();
        },
        error => console.error(error)
      )
    );

    state.unsubscribers.push(
      watchMyGroups(
        user.uid,
        groups => {
          state.groups = groups;
          renderGroupList();
        },
        error => {
          console.error(error);
          showToast(
            "Could not load your groups. Check the database rules."
          );
        }
      )
    );

    activateChat({
      type: "global",
      id: "global",
      title: "Global Lounge",
      subtitle: "Join the conversation with the Emarni community."
    });

    connection("connected", "Connected");
  } catch (error) {
    console.error("Could not initialise Emarni account:", error);
    showToast(friendlyAuthError(error));
    await signOutAccount().catch(() => {});
  }
}

function leaveApp() {
  unsubscribeAll();

  state.user = null;
  state.profile = null;
  state.isAdmin = false;
  state.directory = {};
  state.friendships = {};
  state.requests = {};
  state.groups = [];
  state.messages = [];
  state.archive = {};
  state.reports = {};
  state.banned = {};

  $("appLayout").classList.add("hidden");
  $("authScreen").classList.remove("hidden");
  $("adminOpenBtn").classList.add("hidden");

  $("groupsList").replaceChildren(
    el("p", "subtle-empty", "Your groups will appear here.")
  );
}

// Authentication controls

$("authSwitch").addEventListener("click", () => {
  setAuthMode(
    state.authMode === "signin" ? "signup" : "signin"
  );
});

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("authSubmit");
  button.disabled = true;

  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  const displayName = $("signupName").value.trim();

  try {
    if (state.authMode === "signup") {
      if (displayName.length < 2) {
        throw new Error(
          "Choose a display name with at least 2 characters."
        );
      }

      if (password.length < 8) {
        throw new Error(
          "Choose a password with at least 8 characters."
        );
      }

      await registerAccount({ email, password, displayName });
      showToast("Account created. Your Emarni ID is ready.");
    } else {
      await signInAccount(email, password);
      showToast("Signed in successfully.");
    }
  } catch (error) {
    console.error(error);
    showToast(friendlyAuthError(error));
  } finally {
    button.disabled = false;
  }
});

$("signOutBtn").addEventListener("click", async () => {
  try {
    await signOutAccount();
  } catch (error) {
    showToast(friendlyAuthError(error));
  }
});

// Navigation and conversation controls

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () =>
    changeView(button.dataset.view)
  );
});

$("menuBtn").addEventListener("click", () =>
  $("sidebar").classList.add("open")
);

$("closeSidebar").addEventListener("click", () =>
  $("sidebar").classList.remove("open")
);

$("createGroupBtn").addEventListener(
  "click",
  openCreateGroupDialog
);

$("groupType").addEventListener("change", () => {
  $("businessGroupFields").classList.toggle(
    "hidden",
    $("groupType").value !== "business"
  );
});

$("groupForm").addEventListener("submit", handleCreateGroup);

$("composerForm").addEventListener(
  "submit",
  sendCurrentMessage
);

$("messageInput").addEventListener(
  "input",
  updateCharacterCount
);

$("messageInput").addEventListener("keydown", event => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    sendCurrentMessage(event);
  }
});

$("welcomeHelloBtn").addEventListener("click", () =>
  $("messageInput").focus()
);

$("chatSearchToggle").addEventListener("click", () => {
  $("chatSearchStrip").classList.toggle("hidden");

  if (!$("chatSearchStrip").classList.contains("hidden")) {
    $("chatSearchInput").focus();
  } else {
    $("chatSearchInput").value = "";
    renderMessages();
  }
});

$("clearChatSearch").addEventListener("click", () => {
  $("chatSearchInput").value = "";
  renderMessages();
  $("chatSearchInput").focus();
});

$("chatSearchInput").addEventListener("input", renderMessages);

// Profile, information, and modal controls

$("editProfileBtn").addEventListener("click", openProfileDialog);
$("profileForm").addEventListener("submit", handleProfileSave);

$("profilePhoto").addEventListener("change", () => {
  const file = $("profilePhoto").files[0];

  if (!file) {
    return renderAvatar(
      $("profilePreview"),
      state.profile?.displayName,
      state.profile?.photoURL,
      "avatar avatar-xl"
    );
  }

  if (!file.type.startsWith("image/")) {
    return showToast("Choose an image file for your profile photo.");
  }

  const url = URL.createObjectURL(file);

  renderAvatar(
    $("profilePreview"),
    state.profile?.displayName,
    url,
    "avatar avatar-xl"
  );
});

$("aboutBtn").addEventListener("click", () =>
  $("aboutDialog").showModal()
);

$("aboutHeaderBtn").addEventListener("click", () =>
  $("aboutDialog").showModal()
);

$("adminOpenBtn").addEventListener("click", openAdminConsole);

$("adminUserSearch").addEventListener("input", renderAdminUsers);

document.querySelectorAll(".admin-tab").forEach(button => {
  button.addEventListener("click", () =>
    setAdminTab(button.dataset.adminTab)
  );
});

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () =>
    $(button.dataset.close).close()
  );
});

document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
});

$("adminDialog").addEventListener("close", () => {
  if (state.archiveUnsubscribe) state.archiveUnsubscribe();
  if (state.bannedUnsubscribe) state.bannedUnsubscribe();
  if (state.reportsUnsubscribe) state.reportsUnsubscribe();

  state.archiveUnsubscribe =
    state.bannedUnsubscribe =
    state.reportsUnsubscribe = null;
});

// Start Emarni after Firebase authentication resolves.

const bootStart = Date.now();

watchAuth(async user => {
  try {
    await sleep(Math.max(0, 650 - (Date.now() - bootStart)));

    $("splashScreen")?.classList.add("fade-out");

    if (user) {
      await enterApp(user);
    } else {
      leaveApp();
    }
  } catch (error) {
    console.error("Emarni could not initialise:", error);

    $("splashScreen")?.classList.add("fade-out");
    $("appLayout")?.classList.add("hidden");
    $("authScreen")?.classList.remove("hidden");

    const subtitle = $("authSubtitle");

    if (subtitle) {
      subtitle.textContent =
        "Emarni could not initialise your account. Check Firebase Authentication and Realtime Database rules, then reload.";
    }

    showToast(friendlyAuthError(error));
  } finally {
    window.dispatchEvent(
      new Event("emarni-startup-complete")
    );
  }
});

setAuthMode("signin");
