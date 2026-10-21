// Static Super Admin Access
const ADMIN_CREDENTIALS = {
    username: "admin",
    password: "Admin@2026#Safety"
};

function loginAdmin() {
    const user = document.getElementById("adminUser").value;
    const pass = document.getElementById("adminPass").value;

    if (user === ADMIN_CREDENTIALS.username && pass === ADMIN_CREDENTIALS.password) {
        document.getElementById("adminLoginCard").style.display = "none";
        document.getElementById("adminDashboard").style.display = "block";
        loadAdminData();
    } else {
        document.getElementById("adminLoginErr").style.display = "block";
    }
}

function logoutAdmin() {
    document.getElementById("adminDashboard").style.display = "none";
    document.getElementById("adminLoginCard").style.display = "block";
}

function loadAdminData() {
    const db = firebase.database();

    // 1. Fetch Users, Credentials & Friends
    db.ref("users").on("value", (snapshot) => {
        const users = snapshot.val() || {};
        const tbody = document.getElementById("userTableBody");
        const select1 = document.getElementById("user1Select");
        const select2 = document.getElementById("user2Select");
        
        tbody.innerHTML = "";
        select1.innerHTML = "<option value=''>Select User 1</option>";
        select2.innerHTML = "<option value=''>Select User 2</option>";

        Object.keys(users).forEach((uid) => {
            const u = users[uid];
            const friendsList = u.friends ? Object.values(u.friends).map(f => f.name || f).join(", ") : "None";
            const friendCount = u.friends ? Object.keys(u.friends).length : 0;

            tbody.innerHTML += `
                <tr>
                    <td>${uid}</td>
                    <td>${u.name || "N/A"}</td>
                    <td>${u.email || "N/A"}</td>
                    <td>${u.pass || "******"}</td>
                    <td>${friendCount}</td>
                    <td>${friendsList}</td>
                </tr>
            `;

            select1.innerHTML += `<option value="${uid}">${u.name || uid}</option>`;
            select2.innerHTML += `<option value="${uid}">${u.name || uid}</option>`;
        });
    });

    // 2. Fetch User Reports
    db.ref("reports").on("value", (snapshot) => {
        const reports = snapshot.val() || {};
        const tbody = document.getElementById("reportTableBody");
        tbody.innerHTML = "";

        Object.keys(reports).forEach((rid) => {
            const r = reports[rid];
            tbody.innerHTML += `
                <tr>
                    <td>${rid}</td>
                    <td>${r.reportedBy}</td>
                    <td><span class="badge-danger">${r.targetUser}</span></td>
                    <td>${r.reason}</td>
                    <td>${new Date(r.timestamp).toLocaleString()}</td>
                </tr>
            `;
        });
    });

    // 3. Fetch Deleted Messages (30-day vault retention)
    db.ref("deleted_messages").on("value", (snapshot) => {
        const deletedMsgs = snapshot.val() || {};
        const tbody = document.getElementById("deletedMsgTableBody");
        tbody.innerHTML = "";
        const now = Date.now();
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

        Object.keys(deletedMsgs).forEach((mid) => {
            const m = deletedMsgs[mid];
            const isWithin30Days = (now - m.deletedAt) <= THIRTY_DAYS_MS;

            if (isWithin30Days) {
                tbody.innerHTML += `
                    <tr>
                        <td>${m.sender}</td>
                        <td>${m.receiver}</td>
                        <td>${m.text}</td>
                        <td>${new Date(m.deletedAt).toLocaleString()}</td>
                        <td>Retained (Safety Active)</td>
                    </tr>
                `;
            }
        });
    });
}

// 4. Live Chat Inspection logic
function inspectChat() {
    const u1 = document.getElementById("user1Select").value;
    const u2 = document.getElementById("user2Select").value;
    const box = document.getElementById("chatInspectorBox");

    if (!u1 || !u2 || u1 === u2) {
        alert("Select two different valid users!");
        return;
    }

    const chatRoomId = u1 < u2 ? `${u1}_${u2}` : `${u2}_${u1}`;
    firebase.database().ref("chats/" + chatRoomId).on("value", (snapshot) => {
        const msgs = snapshot.val() || {};
        box.innerHTML = "";
        if (Object.keys(msgs).length === 0) {
            box.innerHTML = "<p>No conversation history found between these users.</p>";
            return;
        }
        Object.values(msgs).forEach((msg) => {
            box.innerHTML += `
                <div style="margin-bottom:8px; padding:5px; border-bottom:1px solid #eee;">
                    <strong>From (${msg.sender}):</strong> ${msg.text} 
                    <span style="font-size:10px; color:#999; float:right;">${new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
            `;
        });
    });
}
