import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, arrayUnion, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { odaiList } from "./odai.js";

const firebaseConfig = {
    apiKey: "AIzaSyCUbcnNw3vd9_HN5FDOPPuEClW6XiUfKN8",
    authDomain: "with-oogiri.firebaseapp.com",
    projectId: "with-oogiri",
    storageBucket: "with-oogiri.firebasestorage.app",
    messagingSenderId: "673839786410",
    appId: "1:673839786410:web:b0fe06aeaa5cdbbae6a3d3",
    measurementId: "G-PLCZY3D7HT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let roomCode = "", myName = "", myId = "", myIcon = "🐱", isHost = false, hasVoted = false, latestRoomData = null, timerInterval = null;
let currentLocalScreen = "home", lastKnownReactionTimes = {}, isProcessingAction = false;
const icons = ['🐱', '🐶', '🦊', '🐈', '🐯', '🦁', '🐰', '🐻'];

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

function renderIcon(icon) {
    return (icon.includes('.') || icon.startsWith('http')) ? `<img src="${icon}" alt="icon">` : icon;
}

function generateId() { return Math.random().toString(36).substring(2, 10); }

function pickUniqueOdai(usedIndices) {
    let availableIndices = odaiList.map((_, i) => i).filter(i => !usedIndices.includes(i));
    if (availableIndices.length === 0) { availableIndices = odaiList.map((_, i) => i); usedIndices = []; }
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    return { index: randomIndex, text: odaiList[randomIndex], newUsedIndices: [...usedIndices, randomIndex] };
}

document.addEventListener("DOMContentLoaded", () => {
    const iconContainer = document.getElementById('home-icon-selector');
    icons.forEach((icon, index) => {
        const div = document.createElement('div');
        div.className = `icon-option ${index === 0 ? 'selected' : ''}`;
        div.innerText = icon;
        div.onclick = () => { myIcon = icon; document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected')); div.classList.add('selected'); };
        iconContainer.appendChild(div);
    });

    const roundSelect = document.getElementById("round-select");
    for(let i=1; i<=10; i++) {
        let opt = document.createElement("option"); opt.value = i; opt.innerText = `${i}問`;
        if(i === 3) opt.selected = true;
        roundSelect.appendChild(opt);
    }
    roundSelect.onchange = (e) => updateRoomSettings('totalRounds', e.target.value);

    const playingStamps = ['W', '草', '！？', '難しい...', 'よゆー！'];
    const revealingStamps = ['W', '草', '！？', 'うまい！', '8888'];
    const resultStamps = ['W', '草', '！？', 'おめでとう', 'ありがとう'];

    const setupStamps = (containerId, list) => {
        const container = document.getElementById(containerId);
        list.forEach(type => {
            const btn = document.createElement('button'); btn.className = 'stamp-btn'; btn.innerText = type;
            btn.onclick = () => sendStamp(type); container.appendChild(btn);
        });
    };

    setupStamps('playing-stamps', playingStamps);
    setupStamps('revealing-stamps', revealingStamps);
    setupStamps('result-stamps', resultStamps);

    document.getElementById("create-room-btn").onclick = createRoom;
    document.getElementById("join-room-btn").onclick = joinRoom;
    document.getElementById("ready-btn").onclick = toggleReady;
    document.getElementById("start-btn-container").onclick = startGame;
    document.getElementById("wait-exit-btn").onclick = exitGame;
    document.getElementById("submit-btn").onclick = submitAnswer;
    document.getElementById("next-reveal-btn").onclick = nextReveal;
    document.getElementById("share-x-btn").onclick = shareToX;
    document.getElementById("back-to-wait-btn").onclick = goBackToWait;
    document.getElementById("exit-game-btn").onclick = exitGame;
    document.getElementById("copy-btn").onclick = copyRoomCode;
    document.getElementById("display-code").onclick = toggleRoomCode;
    document.getElementById("max-users-select").onchange = (e) => updateRoomSettings('maxUsers', e.target.value);
    document.getElementById("time-select").onchange = (e) => updateRoomSettings('timeLimit', e.target.value);
});

window.addEventListener("beforeunload", () => {
    if (roomCode && myId && latestRoomData) {
        const updatedUsers = latestRoomData.users.map(u => 
            u.id === myId ? { ...u, isExited: true, isReady: false } : u
        );
        updateDoc(doc(db, "rooms", roomCode), { users: updatedUsers });
    }
});

async function createRoom() {
    roomCode = Math.floor(10000 + Math.random() * 90000).toString();
    myName = document.getElementById("name-input").value.substring(0, 10) || "名無し";
    myId = generateId(); isHost = true; currentLocalScreen = "wait";
    await setDoc(doc(db, "rooms", roomCode), {
        status: "waiting", users: [{ id: myId, name: myName, icon: myIcon, isReady: false, lastReaction: "", reactionTime: 0, totalScore: 0, isExited: false }], 
        hostId: myId, originalHostId: myId, odai: "", usedOdaiIndices: [], answers: [], revealIndex: 0, timeLeft: 60, voteCount: 0,
        currentRound: 0, totalRounds: 3, maxUsers: 8, timeLimit: 60, allAnswersHistory: []
    });
    setupRoomListener();
}

async function joinRoom() {
    roomCode = document.getElementById("room-input").value;
    if(!roomCode) return;
    const roomRef = doc(db, "rooms", roomCode);
    const docSnap = await getDoc(roomRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        const activeUsers = data.users.filter(u => !u.isExited);
        if (activeUsers.length >= (data.maxUsers || 8)) { alert("満員です"); return; }
        if (data.status !== "waiting") { alert("進行中です"); return; }
    } else { alert("部屋がありません"); return; }
    myName = document.getElementById("name-input").value.substring(0, 10) || "ゲスト";
    myId = generateId(); isHost = false; currentLocalScreen = "wait";
    await updateDoc(roomRef, { users: arrayUnion({ id: myId, name: myName, icon: myIcon, isReady: false, lastReaction: "", reactionTime: 0, totalScore: 0, isExited: false }) });
    setupRoomListener();
}

function setupRoomListener() {
    onSnapshot(doc(db, "rooms", roomCode), async (docSnap) => {
        if (!docSnap.exists()) return;
        latestRoomData = docSnap.data();
        
        // --- ホスト自動継承ロジック ---
        const activeUsers = latestRoomData.users.filter(u => !u.isExited);
        const currentHost = activeUsers.find(u => u.id === latestRoomData.hostId);
        
        if (!currentHost && activeUsers.length > 0) {
            // ホストがいなくなっていたら、リストの先頭（一番古い参加者）を新ホストにする
            const newHostId = activeUsers[0].id;
            await updateDoc(doc(db, "rooms", roomCode), { hostId: newHostId });
            return; // updateDocにより再度Snapshotが飛んでくるので一旦終了
        }
        // --------------------------

        isHost = (latestRoomData.hostId === myId);
        if (currentLocalScreen === "result") { } 
        else if (["playing", "revealing", "voting"].includes(latestRoomData.status)) currentLocalScreen = latestRoomData.status;
        else if (latestRoomData.status === "result") currentLocalScreen = "result";
        else if (latestRoomData.status === "waiting" && currentLocalScreen !== "home") currentLocalScreen = "wait";
        updateUI(latestRoomData);
    });
}

function updateUI(data) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const activeUsers = data.users.filter(u => !u.isExited);
    const bottomBar = document.getElementById("bottom-users");
    
    if (currentLocalScreen !== "home") {
        bottomBar.style.display = "flex";
        const currentIconCount = bottomBar.querySelectorAll('.user-icon-stack').length;
        if (currentIconCount !== activeUsers.length) {
            bottomBar.innerHTML = activeUsers.map(u => `
                <div class="user-icon-stack" id="stack-${u.id}">
                    <div class="bubble" id="bubble-${u.id}"></div>
                    <div class="icon">${renderIcon(u.icon)}</div>
                    <div>${escapeHTML(u.name.substring(0, 10))}${u.id === myId ? '<br>(あなた)' : ''}</div>
                </div>
            `).join("");
        }

        data.users.forEach(u => {
            const bubble = document.getElementById(`bubble-${u.id}`);
            if (bubble && u.reactionTime && u.reactionTime !== lastKnownReactionTimes[u.id]) {
                lastKnownReactionTimes[u.id] = u.reactionTime;
                bubble.innerText = u.lastReaction;
                bubble.classList.remove("show");
                void bubble.offsetWidth; 
                bubble.classList.add("show");
            }
        });
    } else { bottomBar.style.display = "none"; }

    const activeScreen = document.getElementById(`screen-${currentLocalScreen}`);
    if (activeScreen) activeScreen.classList.add("active");

    if (currentLocalScreen === "wait") {
        isProcessingAction = false; 
        document.getElementById("user-counter").innerText = `${activeUsers.length}/${data.maxUsers || 8}`;
        const me = data.users.find(u => u.id === myId);
        const readyBtn = document.getElementById("ready-btn");
        if (me) { 
            readyBtn.innerText = me.isReady ? "準備解除" : "準備完了！"; 
            readyBtn.style.background = me.isReady ? "#ccc" : "#ffd700"; 
            readyBtn.style.color = me.isReady ? "#fff" : "#1a1a1a";
        }
        document.getElementById("user-list").innerHTML = activeUsers.map(u => `
            <div class="user-entry">
                <span>${renderIcon(u.icon)} ${escapeHTML(u.name.substring(0, 10))}${u.id === myId ? ' (あなた)' : ''} ${u.id === data.hostId ? '👑' : ''}</span>
                <span class="status-badge ${u.isReady ? 'status-ready' : 'status-wait'}">${u.isReady ? '準備完了' : '待機中'}</span>
            </div>
        `).join("");
        document.getElementById("room-settings-area").style.display = "block"; 
        document.getElementById("start-btn-container").style.display = isHost ? "inline-block" : "none";
        document.getElementById("guest-msg").style.display = isHost ? "none" : "block";
        const maxSelect = document.getElementById("max-users-select"); const timeSelect = document.getElementById("time-select"); const rSelect = document.getElementById("round-select");
        maxSelect.value = data.maxUsers || 8; timeSelect.value = data.timeLimit || 60; rSelect.value = data.totalRounds || 3;
        maxSelect.disabled = !isHost; timeSelect.disabled = !isHost; rSelect.disabled = !isHost;
        if (isHost) { const allReady = activeUsers.length >= 2 && activeUsers.every(u => u.isReady); document.getElementById("start-btn-container").disabled = !allReady; }
    } 
    else if (currentLocalScreen === "playing") {
        isProcessingAction = false; hasVoted = false;
        document.getElementById("round-display").innerText = `第 ${data.currentRound} / ${data.totalRounds} ラウンド`;
        document.getElementById("current-odai").innerText = data.odai;
        document.getElementById("timer-display").innerText = `残り ${data.timeLeft}秒`;
        const sent = data.answers.some(a => a.userId === myId);
        document.getElementById("submit-btn").disabled = sent;
        document.getElementById("playing-wait-msg").style.display = sent ? "block" : "none";
        if (isHost && (data.answers.length >= activeUsers.length || data.timeLeft <= 0)) goToReveal();
    } 
    else if (currentLocalScreen === "revealing") {
        document.getElementById("revealing-odai").innerText = `お題：${data.odai}`;
        const ans = data.answers && data.answers.length > 0 ? data.answers[data.revealIndex] : null;
        if (ans) {
            document.getElementById("answer-display").innerText = ans.text;
            document.getElementById("author-name").innerText = `回答者: ${escapeHTML(ans.userName)}`;
            document.getElementById("next-reveal-btn").style.display = isHost ? "block" : "none";
        } else if (isHost) updateDoc(doc(db, "rooms", roomCode), { status: "voting" });
    } 
    else if (currentLocalScreen === "voting") {
        isProcessingAction = false; document.getElementById("voting-odai").innerText = `お題：${data.odai}`;
        renderVoteList(data);
        if (isHost && data.voteCount >= activeUsers.length) processVoteEnd(data);
    } 
    else if (currentLocalScreen === "result") renderFinalResults(data);
}

async function updateRoomSettings(field, val) { if (!isHost) return; const update = {}; update[field] = parseInt(val); await updateDoc(doc(db, "rooms", roomCode), update); }
async function toggleReady() { const newUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isReady: !u.isReady } : u); await updateDoc(doc(db, "rooms", roomCode), { users: newUsers }); }
async function startGame() {
    if (!isHost) return;
    const participants = latestRoomData.users.filter(u => !u.isExited).map(u => ({ ...u, isReady: false, totalScore: 0 }));
    const nextOdai = pickUniqueOdai([]);
    await updateDoc(doc(db, "rooms", roomCode), {
        status: "playing", users: participants, currentRound: 1, answers: [], revealIndex: 0, timeLeft: latestRoomData.timeLimit, voteCount: 0,
        odai: nextOdai.text, usedOdaiIndices: nextOdai.newUsedIndices, allAnswersHistory: []
    });
    startTimer(latestRoomData.timeLimit);
}
function startTimer(duration) {
    if (timerInterval) clearInterval(timerInterval);
    let time = duration;
    timerInterval = setInterval(() => { time--; if (isHost) updateDoc(doc(db, "rooms", roomCode), { timeLeft: time }); if (time <= 0) { clearInterval(timerInterval); if (isHost) goToReveal(); } }, 1000);
}
async function submitAnswer() {
    const text = document.getElementById("my-answer").value; if(!text || isProcessingAction) return;
    isProcessingAction = true; document.getElementById("submit-btn").disabled = true;
    await updateDoc(doc(db, "rooms", roomCode), { answers: arrayUnion({ userId: myId, userName: myName, text: text, votes: 0, reactions: 0 }) });
    document.getElementById("my-answer").value = "";
}
async function goToReveal() { if (timerInterval) clearInterval(timerInterval); if (!isHost) return; const currentAnswers = latestRoomData.answers || []; if (currentAnswers.length === 0) processVoteEnd(latestRoomData); else await updateDoc(doc(db, "rooms", roomCode), { status: "revealing", revealIndex: 0 }); }
async function nextReveal() { await updateDoc(doc(db, "rooms", roomCode), { revealIndex: latestRoomData.revealIndex + 1 }); }
function renderVoteList(data) {
    const list = document.getElementById("vote-list"); list.innerHTML = ""; const activeUsers = data.users.filter(u => !u.isExited);
    const others = data.answers.filter(a => a.userId !== myId && activeUsers.some(u => u.id === a.userId));
    if (others.length === 0 || hasVoted) { if (!hasVoted && others.length === 0) { hasVoted = true; updateDoc(doc(db, "rooms", roomCode), { voteCount: data.voteCount + 1 }); } document.getElementById("vote-wait-msg").style.display = "block"; return; }
    document.getElementById("vote-wait-msg").style.display = "none";
    others.forEach(ans => {
        const btn = document.createElement("button"); btn.className = "vote-item"; btn.innerText = ans.text;
        btn.onclick = async () => { if (isProcessingAction) return; isProcessingAction = true; hasVoted = true; const newAns = data.answers.map(a => a.userId === ans.userId ? {...a, votes: a.votes + 1} : a); await updateDoc(doc(db, "rooms", roomCode), { answers: newAns, voteCount: data.voteCount + 1 }); };
        list.appendChild(btn);
    });
}
function renderFinalResults(data) {
    const list = document.getElementById("result-list"); const sorted = [...data.users].sort((a,b) => (b.totalScore || 0) - (a.totalScore || 0));
    list.innerHTML = sorted.map((u, i) => `<div class="result-item"><strong>${i+1}位 (${u.totalScore || 0}pt):</strong> ${renderIcon(u.icon)} ${escapeHTML(u.name.substring(0, 10))}${u.id === myId ? ' (あなた)' : ''} ${u.isExited ? '<small>(退出済)</small>' : ''}</div>`).join("");
    const history = data.allAnswersHistory || [];
    if (history.length > 0) {
        const maxVotes = Math.max(...history.map(a => a.votes));
        if (maxVotes > 0) {
            const finalists = history.filter(a => a.votes === maxVotes); const maxReactions = Math.max(...finalists.map(a => a.reactions || 0));
            const bestFinalists = finalists.filter(a => (a.reactions || 0) === maxReactions); const userOrder = data.users.map(u => u.id);
            bestFinalists.sort((a, b) => userOrder.indexOf(a.userId) - userOrder.indexOf(b.userId)); const winner = bestFinalists[0];
            document.getElementById("mvp-area").style.display = "block"; document.getElementById("mvp-odai").innerText = `お題: ${winner.odai}`;
            document.getElementById("mvp-answer").innerText = `「${winner.text}」`; document.getElementById("mvp-author").innerText = `${escapeHTML(winner.userName)} （${winner.votes}票 / ${winner.reactions || 0}反応）`;
        } else document.getElementById("mvp-area").style.display = "none";
    } else document.getElementById("mvp-area").style.display = "none";
}
async function processVoteEnd(data) {
    if (!isHost) return;
    const updatedUsers = data.users.map(u => { const ans = data.answers.find(a => a.userId === u.id); return { ...u, totalScore: (u.totalScore || 0) + (ans ? ans.votes : 0) }; });
    const updatedHistory = [...(data.allAnswersHistory || []), ...data.answers.map(a => ({...a, odai: data.odai}))];
    if (data.currentRound < data.totalRounds) {
        const nextOdai = pickUniqueOdai(data.usedOdaiIndices || []);
        await updateDoc(doc(db, "rooms", roomCode), { status: "playing", users: updatedUsers, currentRound: data.currentRound + 1, answers: [], revealIndex: 0, voteCount: 0, timeLeft: data.timeLimit, odai: nextOdai.text, usedOdaiIndices: nextOdai.newUsedIndices, allAnswersHistory: updatedHistory });
        startTimer(data.timeLimit);
    } else await updateDoc(doc(db, "rooms", roomCode), { status: "result", users: updatedUsers, allAnswersHistory: updatedHistory });
}
function shareToX() {
    const mvpAnswer = document.getElementById("mvp-answer").innerText, mvpOdai = document.getElementById("mvp-odai").innerText;
    let shareText = `【with!大喜利】結果発表！\n`; if (mvpAnswer && mvpAnswer !== "...") shareText += `🏆今回のMVP回答：${mvpAnswer}\n（${mvpOdai}）\n\n`;
    shareText += `#with大喜利\n`; const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent("https://zetsubouinu.github.io/ZetsubouInu/")}`; window.open(xUrl, '_blank');
}
async function goBackToWait() { currentLocalScreen = "wait"; const updated = latestRoomData.users.map(u => u.id === myId ? {...u, isReady: false, isExited: false} : u); await updateDoc(doc(db, "rooms", roomCode), { users: updated, status: "waiting" }); }
async function exitGame() { if (latestRoomData) { const updatedUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isExited: true, isReady: false } : u); await updateDoc(doc(db, "rooms", roomCode), { users: updatedUsers }); } location.reload(); }
async function sendStamp(type) {
    const newUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, lastReaction: type, reactionTime: Date.now() } : u); const updateFields = { users: newUsers };
    if (latestRoomData.status === "revealing") {
        const currentAns = latestRoomData.answers[latestRoomData.revealIndex];
        if (currentAns && currentAns.userId !== myId) {
            const newAnswers = latestRoomData.answers.map((a, i) => { if (i === latestRoomData.revealIndex) return { ...a, reactions: (a.reactions || 0) + 1 }; return a; });
            updateFields.answers = newAnswers;
        }
    }
    await updateDoc(doc(db, "rooms", roomCode), updateFields);
}
function copyRoomCode() { if (!roomCode) return; navigator.clipboard.writeText(roomCode).then(() => { const toast = document.getElementById("copy-toast"); toast.className = "show"; setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 2000); }); }
function toggleRoomCode() { const display = document.getElementById("display-code"); display.innerText = (display.innerText === "*****") ? roomCode : "*****"; display.style.background = (display.innerText === "*****") ? "#eee" : "transparent"; }