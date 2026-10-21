// --- FIXED FRIEND SEARCH FUNCTIONALITY ---
function searchFriends() {
    const searchInput = document.getElementById("friendSearchInput").value.trim().toLowerCase();
    const searchResultsContainer = document.getElementById("searchResults");
    searchResultsContainer.innerHTML = "";

    if (!searchInput) return;

    firebase.database().ref("users").once("value", (snapshot) => {
        const users = snapshot.val() || {};
        let found = false;

        Object.keys(users).forEach((uid) => {
            const user = users[uid];
            const currentUid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;

            if (uid !== currentUid && user.name && user.name.toLowerCase().includes(searchInput)) {
                found = true;
                searchResultsContainer.innerHTML += `
                    <div class="user-card" style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #ddd;">
                        <span>${user.name} (${user.email})</span>
                        <button onclick="addFriend('${uid}', '${user.name}')" style="padding:4px 8px; background:#28a745; color:white; border:none; border-radius:3px;">Add Friend</button>
                        <button onclick="reportUser('${uid}', '${user.name}')" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; margin-left:5px;">Report</button>
                    </div>
                `;
            }
        });

        if (!found) {
            searchResultsContainer.innerHTML = "<p style='padding:8px; color:#666;'>No user found with this name.</p>";
        }
    });
}

// Add Friend Action
function addFriend(friendUid, friendName) {
    const currentUid = firebase.auth().currentUser.uid;
    firebase.database().ref(`users/${currentUid}/friends/${friendUid}`).set({
        uid: friendUid,
        name: friendName
    });
    alert(`${friendName} is added to your friend list!`);
}

// Report Action (Directly feeds to Admin Panel)
function reportUser(targetUid, targetName) {
    const reason = prompt(`Enter reason for reporting ${targetName}:`);
    if (!reason) return;

    const currentUid = firebase.auth().currentUser.uid;
    const reportRef = firebase.database().ref("reports").push();
    
    reportRef.set({
        reportedBy: currentUid,
        targetUser: `${targetName} (${targetUid})`,
        reason: reason,
        timestamp: Date.now()
    }).then(() => {
        alert("Report submitted to admin for safety review.");
    });
}

// --- DELETED MESSAGE HANDLING (30 Days Retention Notice) ---
function deleteMessage(chatRoomId, messageId, messageData) {
    // 1. One-time System Safety Notice
    const hasSeenNotice = localStorage.getItem("hasSeenSafetyDeleteNotice");
    if (!hasSeenNotice) {
        alert("Notice: Deleted messages are permanently hidden from chat views. For safety and security compliance, data is retained in secure system backup records for up to 30 days.");
        localStorage.setItem("hasSeenSafetyDeleteNotice", "true");
    }

    // 2. Move message to background 'deleted_messages' node (invisible to users)
    firebase.database().ref(`deleted_messages/${messageId}`).set({
        ...messageData,
        deletedAt: Date.now()
    });

    // 3. Remove message from visible chat history
    firebase.database().ref(`chats/${chatRoomId}/${messageId}`).remove();
}
