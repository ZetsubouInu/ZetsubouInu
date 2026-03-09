import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, arrayUnion, getDoc, deleteDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

// 🌟 タイマー関連の変数を完備
let roomCode = "", myName = "", myId = "", myIcon = "🐱", isHost = false, hasVoted = false, latestRoomData = null, timerInterval = null, voteTimerInterval = null, roundResultTimerInterval = null;
let currentLocalScreen = "home", lastKnownReactionTimes = {}, isProcessingAction = false, isViewer = false;

let currentRevealingAnswerIndex = -1;
let typeWriterTimer = null;
let playedCountdownRounds = []; 
let playedRevealRounds = []; 
let playedVoteRounds = []; 
let playedRoundResultRounds = []; 
let revealCountdownTimer = null; 

const icons = ['🐱', '🐶', '🦊', '🐈', '🐯', '🦁', '🐰', '🐻'];

const reactionSound = new Audio("assets/audio/se/reaction.mp3");
const limitSound = new Audio("assets/audio/se/limit10.mp3");
limitSound.loop = false; 
let isLimitSoundPlayed = false;

const voiceCountdown = new Audio("assets/audio/se/321voice.mp3");
const buttonSound = new Audio("assets/audio/se/button.mp3");
const voteSound = new Audio("assets/audio/se/vote.mp3");
const answerSound = new Audio("assets/audio/se/answer.mp3"); 

const bgmMain = new Audio("assets/audio/bgm/bgm_main.mp3");
bgmMain.loop = true; bgmMain.volume = 0;  
const bgmBattle = new Audio("assets/audio/bgm/bgm_battle.mp3");
bgmBattle.loop = true; bgmBattle.volume = 0;
const bgmVote = new Audio("assets/audio/bgm/bgm_vote.mp3");
bgmVote.loop = true; bgmVote.volume = 0;

let isMainBgmPlaying = false, isBattleBgmPlaying = false, isVoteBgmPlaying = false; 
let hasUserInteracted = false, isCountdownActive = false; 
const BASE_BGM_VOLUME = 0.3, BASE_SE_VOLUME = 0.6; 
let bgmFactor = 0.4, seFactor = 0.4; 

function setFixedBackground() {
    const existing = document.getElementById("bg-pattern-container");
    if (existing) existing.remove();
    const bgContainer = document.createElement("div");
    bgContainer.id = "bg-pattern-container";
    bgContainer.style.position = "fixed"; bgContainer.style.top = "0"; bgContainer.style.left = "0";
    bgContainer.style.width = "100vw"; bgContainer.style.height = "100vh"; bgContainer.style.zIndex = "-1"; 
    bgContainer.style.pointerEvents = "none"; bgContainer.style.overflow = "hidden";
    bgContainer.style.backgroundColor = "#fffdf5"; 
    
    const bgImage = document.createElement("img");
    bgImage.src = "assets/svg/pattern.svg";
    bgImage.style.position = "absolute"; bgImage.style.top = "50%"; bgImage.style.left = "50%";
    bgImage.style.transform = "translate(-50%, -50%)"; 
    bgImage.style.minWidth = "100vw"; bgImage.style.minHeight = "100vh";
    bgImage.style.width = "100%"; bgImage.style.height = "100%";
    bgImage.style.opacity = "0.3"; bgImage.style.objectFit = "cover"; 
    bgContainer.appendChild(bgImage); document.body.appendChild(bgContainer);
}

function playButtonSound() { const playSound = buttonSound.cloneNode(); playSound.volume = seFactor * BASE_SE_VOLUME; playSound.play().catch(() => {}); }
function playVoteSound() { const playSound = voteSound.cloneNode(); playSound.volume = seFactor * BASE_SE_VOLUME; playSound.play().catch(() => {}); }
function fadeAudio(audio, targetScreenFactor, duration) {
    if (audio.fadeInterval) { clearInterval(audio.fadeInterval); audio.fadeInterval = null; }
    const steps = 30; const stepTime = duration / steps;
    const targetActualVol = targetScreenFactor * bgmFactor * BASE_BGM_VOLUME;
    const volStep = (targetActualVol - audio.volume) / steps;
    if (targetScreenFactor > 0 && audio.paused) audio.play().catch(e => console.log(e));
    audio.fadeInterval = setInterval(() => {
        let newVol = audio.volume + volStep;
        if ((volStep > 0 && newVol >= targetActualVol) || (volStep < 0 && newVol <= targetActualVol)) {
            newVol = targetActualVol; clearInterval(audio.fadeInterval); audio.fadeInterval = null;
            if (targetActualVol === 0) audio.pause();
        }
        audio.volume = Math.max(0, Math.min(1, newVol));
    }, stepTime);
}

function manageBgm(screen) {
    if (!hasUserInteracted) return;
    if (["home", "wait", "result"].includes(screen)) {
        isMainBgmPlaying = true; isBattleBgmPlaying = false; isVoteBgmPlaying = false;
        fadeAudio(bgmMain, 1, 1000); fadeAudio(bgmBattle, 0, 1000); fadeAudio(bgmVote, 0, 1000);
    } else if (["playing"].includes(screen)) {
        isMainBgmPlaying = false; isBattleBgmPlaying = !isCountdownActive; isVoteBgmPlaying = false;
        fadeAudio(bgmMain, 0, 1000); fadeAudio(bgmVote, 0, 1000); 
        if (isCountdownActive) fadeAudio(bgmBattle, 0, 500); else fadeAudio(bgmBattle, 1, 1000);
    } else if (screen === "reveal_standby") {
        isMainBgmPlaying = false; isBattleBgmPlaying = false; isVoteBgmPlaying = false;
        fadeAudio(bgmMain, 0, 1000); fadeAudio(bgmBattle, 0, 1000); fadeAudio(bgmVote, 0, 1000);
    } else if (["revealing", "voting", "round_result"].includes(screen)) {
        isMainBgmPlaying = false; isBattleBgmPlaying = false; isVoteBgmPlaying = true;
        fadeAudio(bgmMain, 0, 1000); fadeAudio(bgmBattle, 0, 1000); fadeAudio(bgmVote, 1, 1000); 
    }
}

function unlockAudio() {
    if (!hasUserInteracted) {
        hasUserInteracted = true; manageBgm(currentLocalScreen);
        document.removeEventListener("click", unlockAudio); document.removeEventListener("keydown", unlockAudio);
    }
}
document.addEventListener("click", unlockAudio); document.addEventListener("keydown", unlockAudio);

function typeWriter(element, text, speed = 190, onComplete = null) {
    if (typeWriterTimer) clearInterval(typeWriterTimer);
    element.innerHTML = ""; const chars = Array.from(text); 
    chars.forEach(char => { const span = document.createElement("span"); span.textContent = char; span.style.visibility = "hidden"; element.appendChild(span); });
    let i = 0; const spans = element.querySelectorAll("span");
    typeWriterTimer = setInterval(() => {
        if (i < spans.length) { spans[i].style.visibility = "visible"; i++; } 
        else { clearInterval(typeWriterTimer); typeWriterTimer = null; if (onComplete) onComplete(); }
    }, speed);
}

function showCountdown() {
    const overlay = document.getElementById("countdown-overlay"), textEl = document.getElementById("countdown-text");
    if (!overlay || !textEl) return;
    overlay.style.display = "flex"; isCountdownActive = true; manageBgm(currentLocalScreen); 
    if (hasUserInteracted) { voiceCountdown.volume = seFactor * BASE_SE_VOLUME; voiceCountdown.currentTime = 0; voiceCountdown.play().catch(e => console.log(e)); }
    let count = 3; textEl.innerText = count; textEl.setAttribute("data-text", count);
    textEl.classList.remove("countdown-anim"); void textEl.offsetWidth; textEl.classList.add("countdown-anim");
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            textEl.innerText = count; textEl.setAttribute("data-text", count);
            textEl.classList.remove("countdown-anim"); void textEl.offsetWidth; textEl.classList.add("countdown-anim");
        } else if (count === 0) {
            textEl.style.fontSize = "min(12vw, 120px)"; textEl.innerText = "START!"; textEl.setAttribute("data-text", "START!");
            textEl.classList.remove("countdown-anim"); void textEl.offsetWidth; textEl.classList.add("countdown-anim");
        } else { 
            clearInterval(interval); overlay.style.display = "none"; textEl.style.fontSize = ""; 
            isCountdownActive = false; manageBgm(currentLocalScreen);
        }
    }, 1000);
}

function showAnnouncement(text) {
    const overlay = document.getElementById("countdown-overlay"), textEl = document.getElementById("countdown-text");
    if (!overlay || !textEl) return;
    overlay.style.display = "flex"; isCountdownActive = true; manageBgm(currentLocalScreen);
    if (text === "回答発表！" && hasUserInteracted) { answerSound.volume = seFactor * BASE_SE_VOLUME; answerSound.currentTime = 0; answerSound.play().catch(e => console.log(e)); }
    textEl.style.fontSize = "min(10vw, 100px)"; textEl.innerText = text; textEl.setAttribute("data-text", text);
    textEl.classList.remove("countdown-anim"); void textEl.offsetWidth; textEl.classList.add("countdown-anim");
    textEl.style.animationDuration = "2s"; textEl.style.animationFillMode = "forwards";
    setTimeout(() => {
        overlay.style.display = "none"; textEl.style.fontSize = ""; textEl.style.animationDuration = ""; textEl.style.animationFillMode = "";
        isCountdownActive = false; manageBgm(currentLocalScreen);
    }, 2000); 
}

function startRevealCountdown(data) {
    const timerEl = document.getElementById("reveal-timer-display");
    if (!timerEl) return;
    const isLastAnswer = data.revealIndex >= data.answers.length - 1;
    const baseText = isLastAnswer ? "投票に移るまで残り" : "次の回答まで残り";
    let timeLeft = 15; timerEl.innerText = `（${baseText} ${timeLeft}秒）`; timerEl.style.display = "block";
    if (revealCountdownTimer) clearInterval(revealCountdownTimer);
    revealCountdownTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) timerEl.innerText = `（${baseText} ${timeLeft}秒）`;
        else { clearInterval(revealCountdownTimer); timerEl.style.display = "none"; if (isHost) nextReveal(); }
    }, 1000);
}

function startVoteTimer(duration) {
    if (voteTimerInterval) clearInterval(voteTimerInterval);
    let time = duration;
    voteTimerInterval = setInterval(() => {
        time--;
        if (isHost) {
            updateDoc(doc(db, "rooms", roomCode), { voteTimeLeft: time });
            if (time <= 0) {
                clearInterval(voteTimerInterval);
                processVoteEnd(latestRoomData);
            }
        }
    }, 1000);
}

function startRoundResultTimer(duration) {
    if (roundResultTimerInterval) clearInterval(roundResultTimerInterval);
    let time = duration;
    roundResultTimerInterval = setInterval(() => {
        time--;
        if (isHost) {
            updateDoc(doc(db, "rooms", roomCode), { roundResultTimeLeft: time });
            if (time <= 0) {
                clearInterval(roundResultTimerInterval);
                processRoundResultEnd(latestRoomData);
            }
        }
    }, 1000);
}

function escapeHTML(str) { if (!str) return ""; return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function renderIcon(icon) { return (icon.includes('.') || icon.startsWith('http')) ? `<img src="${icon}" alt="icon">` : icon; }
function generateId() { return Math.random().toString(36).substring(2, 10); }

function pickUniqueOdai(usedIndices) {
    let availableIndices = odaiList.map((_, i) => i).filter(i => !usedIndices.includes(i));
    if (availableIndices.length === 0) { availableIndices = odaiList.map((_, i) => i); usedIndices = []; }
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    return { index: randomIndex, text: odaiList[randomIndex], newUsedIndices: [...usedIndices, randomIndex] };
}

document.addEventListener("DOMContentLoaded", () => {
    setFixedBackground();
    function updateSliderBg(slider) { const val = (slider.value - slider.min) / (slider.max - slider.min) * 100; slider.style.background = `linear-gradient(to right, #ffd700 ${val}%, #ddd ${val}%)`; }
    const toggleBtn = document.getElementById("volume-toggle-btn"), panel = document.getElementById("volume-panel");
    if (toggleBtn && panel) {
        toggleBtn.onclick = (e) => { e.stopPropagation(); panel.classList.toggle("active"); };
        document.addEventListener("click", () => panel.classList.remove("active"));
        panel.onclick = (e) => e.stopPropagation();
    }
    const bgmSlider = document.getElementById("bgm-volume");
    if (bgmSlider) {
        bgmSlider.value = bgmFactor; updateSliderBg(bgmSlider); 
        bgmSlider.addEventListener("input", (e) => {
            updateSliderBg(e.target); bgmFactor = parseFloat(e.target.value); 
            if (isMainBgmPlaying) { if (bgmMain.fadeInterval) { clearInterval(bgmMain.fadeInterval); bgmMain.fadeInterval = null; } bgmMain.volume = bgmFactor * BASE_BGM_VOLUME; }
            if (isBattleBgmPlaying) { if (bgmBattle.fadeInterval) { clearInterval(bgmBattle.fadeInterval); bgmBattle.fadeInterval = null; } bgmBattle.volume = bgmFactor * BASE_BGM_VOLUME; }
            if (isVoteBgmPlaying) { if (bgmVote.fadeInterval) { clearInterval(bgmVote.fadeInterval); bgmVote.fadeInterval = null; } bgmVote.volume = bgmFactor * BASE_BGM_VOLUME; }
        });
    }
    const seSlider = document.getElementById("se-volume");
    if (seSlider) {
        seSlider.value = seFactor; updateSliderBg(seSlider); 
        seSlider.addEventListener("input", (e) => { 
            updateSliderBg(e.target); seFactor = parseFloat(e.target.value); 
            if (!limitSound.paused) limitSound.volume = seFactor * BASE_SE_VOLUME; 
            if (!voiceCountdown.paused) voiceCountdown.volume = seFactor * BASE_SE_VOLUME; 
        });
        seSlider.addEventListener("change", (e) => { const playSound = reactionSound.cloneNode(); playSound.volume = seFactor * BASE_SE_VOLUME; playSound.play().catch(() => {}); });
    }
    const iconContainer = document.getElementById('home-icon-selector');
    if (iconContainer) {
        icons.forEach((icon, index) => {
            const div = document.createElement('div'); div.className = `icon-option ${index === 0 ? 'selected' : ''}`; div.innerText = icon;
            div.onclick = () => { playButtonSound(); myIcon = icon; document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected')); div.classList.add('selected'); };
            iconContainer.appendChild(div);
        });
    }
    const roundSelect = document.getElementById("round-select");
    if (roundSelect) {
        for(let i=1; i<=10; i++) { let opt = document.createElement("option"); opt.value = i; opt.innerText = `${i}問`; if(i === 3) opt.selected = true; roundSelect.appendChild(opt); }
        roundSelect.onchange = (e) => updateRoomSettings('totalRounds', e.target.value);
    }

    const setupStamps = (containerId, list) => {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = "";
            list.forEach(type => {
                const btn = document.createElement('button'); btn.className = 'stamp-btn'; btn.innerText = type;
                btn.onclick = () => sendStamp(type); container.appendChild(btn);
            });
        }
    };
    setupStamps('playing-stamps', ['W', '草', '！？', '難しい...', 'よゆー！']);
    setupStamps('revealing-stamps', ['W', '草', '！？', 'うまい！', '8888']);
    setupStamps('result-stamps', ['W', '草', '！？', 'おめでとう', 'ありがとう']);

    const handleEnter = (e, btnId) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const btn = document.getElementById(btnId); if (btn && !btn.disabled) btn.click(); } };
    const myAnswerInput = document.getElementById("my-answer");
    if (myAnswerInput) myAnswerInput.addEventListener("keydown", (e) => handleEnter(e, "submit-btn"));

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
    document.getElementById("allow-viewers-checkbox").onchange = (e) => { updateRoomSettings('allowViewers', e.target.checked); };
    
    document.getElementById("end-vote-btn").onclick = () => { 
        playButtonSound(); 
        processVoteEnd(latestRoomData); 
    };

    document.getElementById("rr-next-btn").onclick = async () => {
        playButtonSound();
        const newUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isReady: true } : u);
        await updateDoc(doc(db, "rooms", roomCode), { users: newUsers });
    };
});

window.addEventListener("beforeunload", () => {
    if (roomCode && myId && latestRoomData && !isViewer) {
        const activeOthers = latestRoomData.users.filter(u => u.id !== myId && !u.isExited);
        if (activeOthers.length === 0) deleteDoc(doc(db, "rooms", roomCode));
        else {
            const updatedUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isExited: true, isReady: false } : u);
            updateDoc(doc(db, "rooms", roomCode), { users: updatedUsers });
        }
    }
});

async function cleanupOldRooms() {
    try {
        const threshold = Date.now() - (24 * 60 * 60 * 1000);
        const q = query(collection(db, "rooms"), where("createdAt", "<", threshold));
        const snapshot = await getDocs(q);
        snapshot.forEach(d => {
            deleteDoc(doc(db, "rooms", d.id)).catch(e => console.log(e));
        });
    } catch (error) {
        console.log("Cleanup error:", error);
    }
}

async function createRoom() {
    playButtonSound(); 
    roomCode = Math.floor(10000 + Math.random() * 90000).toString();
    const vCode = Math.floor(100000 + Math.random() * 900000).toString();
    myName = document.getElementById("name-input").value.substring(0, 10) || "名無し";
    myId = generateId(); isHost = true; isViewer = false; currentLocalScreen = "wait";
    playedCountdownRounds = []; playedRevealRounds = []; playedVoteRounds = []; playedRoundResultRounds = []; 

    await setDoc(doc(db, "rooms", roomCode), {
        status: "waiting", 
        users: [{ id: myId, name: myName, icon: myIcon, isReady: false, lastReaction: "", reactionTime: 0, totalScore: 0, isExited: false }], 
        hostId: myId, originalHostId: myId, odai: "", usedOdaiIndices: [], answers: [], revealIndex: 0, timeLeft: 60, voteCount: 0,
        currentRound: 0, totalRounds: 3, maxUsers: 8, timeLimit: 60, allAnswersHistory: [],
        allowViewers: false, viewerCode: vCode,
        createdAt: Date.now()
    });
    
    cleanupOldRooms();
    setupRoomListener();
}

async function joinRoom() {
    playButtonSound(); 
    const inputCode = document.getElementById("room-input").value.trim();
    if(!inputCode) return;
    
    let roomRef = doc(db, "rooms", inputCode);
    let docSnap = await getDoc(roomRef);
    
    if (docSnap.exists()) {
        const data = docSnap.data();
        const activeUsers = data.users.filter(u => !u.isExited);
        if (activeUsers.length >= (data.maxUsers || 8)) { alert("満員です"); return; }
        if (data.status !== "waiting") { alert("進行中です"); return; }
        roomCode = inputCode;
        isViewer = false;
    } else { 
        const q = query(collection(db, "rooms"), where("viewerCode", "==", inputCode));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const vDoc = querySnapshot.docs[0];
            if (!vDoc.data().allowViewers) { alert("この投票所は現在閉じられています"); return; }
            roomCode = vDoc.id; 
            roomRef = doc(db, "rooms", roomCode);
            isViewer = true; 
        } else {
            alert("部屋が見つかりません。コードを確認してください。"); return; 
        }
    }
    
    myName = document.getElementById("name-input").value.substring(0, 10) || (isViewer ? "観客" : "ゲスト");
    myId = generateId(); isHost = false; currentLocalScreen = "wait";
    playedCountdownRounds = []; playedRevealRounds = []; playedVoteRounds = []; playedRoundResultRounds = []; 
    
    if (!isViewer) {
        await updateDoc(roomRef, { users: arrayUnion({ id: myId, name: myName, icon: myIcon, isReady: false, lastReaction: "", reactionTime: 0, totalScore: 0, isExited: false }) });
    }
    setupRoomListener();
}

function setupRoomListener() {
    onSnapshot(doc(db, "rooms", roomCode), async (docSnap) => {
        if (!docSnap.exists()) return;
        latestRoomData = docSnap.data();
        const activeUsers = latestRoomData.users.filter(u => !u.isExited);
        const currentHost = activeUsers.find(u => u.id === latestRoomData.hostId);
        if (!currentHost && activeUsers.length > 0 && !isViewer) {
            await updateDoc(doc(db, "rooms", roomCode), { hostId: activeUsers[0].id }); return;
        }
        isHost = (latestRoomData.hostId === myId);
        
        if (latestRoomData.status === "waiting") {
            if (currentLocalScreen !== "home" && currentLocalScreen !== "result") currentLocalScreen = "wait";
        } else if (["playing", "reveal_standby", "revealing", "voting", "round_result"].includes(latestRoomData.status)) {
            currentLocalScreen = latestRoomData.status;
        } else if (latestRoomData.status === "result") {
            if (currentLocalScreen !== "home" && currentLocalScreen !== "wait") currentLocalScreen = "result";
        }
        updateUI(latestRoomData);
    });
}

function updateUI(data) {
    if (currentLocalScreen === "playing" && !playedCountdownRounds.includes(data.currentRound)) {
        playedCountdownRounds.push(data.currentRound); showCountdown();
    }
    manageBgm(currentLocalScreen);
    if (currentLocalScreen !== "playing") { isLimitSoundPlayed = false; limitSound.pause(); limitSound.currentTime = 0; }
    if (currentLocalScreen !== "revealing" && revealCountdownTimer) { clearInterval(revealCountdownTimer); revealCountdownTimer = null; }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const activeUsers = data.users.filter(u => !u.isExited);
    const bottomBar = document.getElementById("bottom-users");
    
    if (currentLocalScreen !== "home" && !isViewer) {
        bottomBar.style.display = "flex";
        const answerStatus = (data.answers || []).map(a => a.userId).sort().join(",");
        const currentSignature = activeUsers.length + "_" + answerStatus + "_" + data.status + "_" + currentLocalScreen;
        if (bottomBar.dataset.signature !== currentSignature) {
            bottomBar.dataset.signature = currentSignature;
            bottomBar.innerHTML = activeUsers.map(u => {
                const hasAnswered = data.answers && data.answers.some(a => a.userId === u.id);
                const checkMark = ((currentLocalScreen === "playing" || currentLocalScreen === "reveal_standby") && hasAnswered) ? `<div style="position:absolute; top:-5px; right:-5px; background:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border:2px solid #1a1a1a; z-index:10; font-size:12px; box-shadow:0 2px 5px rgba(0,0,0,0.2);">✅</div>` : "";
                return `<div class="user-icon-stack" id="stack-${u.id}" style="position:relative;">${checkMark}<div class="bubble" id="bubble-${u.id}"></div><div class="icon">${renderIcon(u.icon)}</div><div>${escapeHTML(u.name.substring(0, 10))}${u.id === myId ? '<br>(あなた)' : ''}</div></div>`;
            }).join("");
        }
        data.users.forEach(u => {
            if (u.reactionTime) {
                if (lastKnownReactionTimes[u.id] === undefined) lastKnownReactionTimes[u.id] = u.reactionTime;
                else if (u.reactionTime !== lastKnownReactionTimes[u.id]) {
                    lastKnownReactionTimes[u.id] = u.reactionTime;
                    const bubble = document.getElementById(`bubble-${u.id}`);
                    if (bubble) {
                        bubble.innerText = u.lastReaction; bubble.classList.remove("show"); void bubble.offsetWidth; bubble.classList.add("show");
                        const playSound = reactionSound.cloneNode(); playSound.volume = seFactor * BASE_SE_VOLUME; playSound.play().catch(() => {});
                    }
                }
            }
        });
    } else { bottomBar.style.display = "none"; }

    const activeScreenId = currentLocalScreen === "reveal_standby" ? "playing" : currentLocalScreen;
    const activeScreen = document.getElementById(`screen-${activeScreenId}`);
    if (activeScreen) activeScreen.classList.add("active");

    if (currentLocalScreen === "wait") {
        isProcessingAction = false; 
        document.getElementById("user-counter").innerText = `${activeUsers.length}/${data.maxUsers || 8}`;
        
        const roomCodeArea = document.getElementById("room-code-area");
        if (roomCodeArea) roomCodeArea.style.display = isViewer ? "none" : "block";

        const viewerWaitMsg = document.getElementById("viewer-wait-msg");
        if (viewerWaitMsg) viewerWaitMsg.style.display = isViewer ? "block" : "none";

        if (isViewer) {
            document.getElementById("ready-btn").style.display = "none";
        } else {
            document.getElementById("ready-btn").style.display = "inline-block";
            const me = data.users.find(u => u.id === myId);
            if (me) { 
                const rBtn = document.getElementById("ready-btn");
                rBtn.innerText = me.isReady ? "準備解除" : "準備完了！"; 
                rBtn.style.background = me.isReady ? "#ccc" : "#ffd700"; rBtn.style.color = me.isReady ? "#fff" : "#1a1a1a";
            }
        }
        
        document.getElementById("user-list").innerHTML = activeUsers.map(u => `
            <div class="user-entry"><span>${renderIcon(u.icon)} ${escapeHTML(u.name.substring(0, 10))}${u.id === myId ? ' (あなた)' : ''} ${u.id === data.hostId ? '👑' : ''}</span>
            <span class="status-badge ${u.isReady ? 'status-ready' : 'status-wait'}">${u.isReady ? '準備完了' : '待機中'}</span></div>
        `).join("");
        
        const hostMsg = document.getElementById("host-msg"); if (hostMsg) hostMsg.style.display = isHost ? "block" : "none";
        document.getElementById("room-settings-area").style.display = isViewer ? "none" : "block"; 
        document.getElementById("start-btn-container").style.display = isHost ? "inline-block" : "none";
        document.getElementById("guest-msg").style.display = isHost ? "none" : "block";
        
        const maxSelect = document.getElementById("max-users-select"); const timeSelect = document.getElementById("time-select"); const rSelect = document.getElementById("round-select");
        maxSelect.value = data.maxUsers || 8; timeSelect.value = data.timeLimit || 60; rSelect.value = data.totalRounds || 3;
        maxSelect.disabled = !isHost; timeSelect.disabled = !isHost; rSelect.disabled = !isHost;
        
        const streamerArea = document.getElementById("streamer-settings-area");
        if (streamerArea) streamerArea.style.display = isHost ? "block" : "none";
        
        if (isHost) { 
            document.getElementById("allow-viewers-checkbox").checked = !!data.allowViewers;
            if (data.allowViewers) {
                document.getElementById("viewer-code-display").style.display = "block";
                document.getElementById("v-code").innerText = data.viewerCode;
            } else {
                document.getElementById("viewer-code-display").style.display = "none";
            }

            const allReady = activeUsers.length >= 2 && activeUsers.every(u => u.isReady); 
            document.getElementById("start-btn-container").disabled = !allReady; 
        }
    } 
    else if (currentLocalScreen === "playing") {
        isProcessingAction = false; hasVoted = false; currentRevealingAnswerIndex = -1; 
        document.getElementById("round-display").innerText = `第 ${data.currentRound} / ${data.totalRounds} ラウンド`;
        
        const timerDisplay = document.getElementById("timer-display");
        timerDisplay.innerText = `残り ${data.timeLeft}秒`;
        if (data.timeLeft <= 10 && data.timeLeft > 0) {
            timerDisplay.style.color = "red"; 
            if (!isLimitSoundPlayed && hasUserInteracted) { isLimitSoundPlayed = true; limitSound.volume = seFactor * BASE_SE_VOLUME; limitSound.currentTime = 0; limitSound.play().catch(e => console.log(e)); }
        } else timerDisplay.style.color = "#1a1a1a"; 

        if (isViewer) {
            document.getElementById("current-odai").style.display = "none";
            document.getElementById("my-answer").style.display = "none";
            document.getElementById("submit-btn").style.display = "none";
            document.getElementById("playing-wait-msg").style.display = "block";
            document.getElementById("playing-wait-msg").innerText = "プレイヤー回答中・・・\n発表をお待ちください！";
            document.getElementById("playing-wait-msg").style.fontSize = "22px";
            document.getElementById("playing-wait-msg").style.marginTop = "60px";
            document.getElementById("playing-stamps").style.display = "none";
        } else {
            document.getElementById("current-odai").style.display = "block";
            document.getElementById("current-odai").innerText = data.odai;
            document.getElementById("my-answer").style.display = "block";
            document.getElementById("submit-btn").style.display = "inline-block";
            document.getElementById("playing-stamps").style.display = "flex";
            document.getElementById("playing-wait-msg").style.fontSize = "";
            document.getElementById("playing-wait-msg").style.marginTop = "";
            const sent = data.answers.some(a => a.userId === myId);
            document.getElementById("submit-btn").disabled = sent;
            document.getElementById("playing-wait-msg").style.display = sent ? "block" : "none";
            document.getElementById("playing-wait-msg").innerText = "送信完了！他の人を待っています...";
            
            if (isHost && (data.answers.length >= activeUsers.length || data.timeLeft <= 0)) goToReveal();
        }
    } 
    else if (currentLocalScreen === "reveal_standby") {
        document.getElementById("round-display").innerText = `第 ${data.currentRound} / ${data.totalRounds} ラウンド`;
        if(!isViewer) document.getElementById("current-odai").innerText = data.odai;
        const timerDisplay = document.getElementById("timer-display");
        timerDisplay.innerText = `終了！`; timerDisplay.style.color = "red";
        document.getElementById("submit-btn").disabled = true;
        if (!playedRevealRounds.includes(data.currentRound)) { playedRevealRounds.push(data.currentRound); showAnnouncement("回答発表！"); }
    }
    else if (currentLocalScreen === "revealing") {
        document.getElementById("revealing-odai").innerText = `お題：${data.odai}`;
        const ans = data.answers && data.answers.length > 0 ? data.answers[data.revealIndex] : null;
        if (ans) {
            if (currentRevealingAnswerIndex !== data.revealIndex) { 
                currentRevealingAnswerIndex = data.revealIndex; 
                const timerEl = document.getElementById("reveal-timer-display");
                if (timerEl) timerEl.style.display = "none";
                if (revealCountdownTimer) clearInterval(revealCountdownTimer);
                typeWriter(document.getElementById("answer-display-inner"), ans.text, 190, () => { startRevealCountdown(data); }); 
            }
            document.getElementById("author-name").innerText = `回答者: ${escapeHTML(ans.userName)}`;
            const nextBtn = document.getElementById("next-reveal-btn");
            nextBtn.innerText = (data.revealIndex >= data.answers.length - 1) ? "投票画面へ進む" : "次の回答へ";
            nextBtn.style.display = isHost ? "block" : "none";
        } else if (isHost) {
            updateDoc(doc(db, "rooms", roomCode), { status: "voting", voteTimeLeft: 15 });
        }
        
        const revStamps = document.getElementById("revealing-stamps");
        if (revStamps) revStamps.style.display = isViewer ? "none" : "flex";
    } 
    else if (currentLocalScreen === "voting") {
        isProcessingAction = false; 
        document.getElementById("voting-odai").innerText = `お題：${data.odai}`;
        renderVoteList(data);
        
        const timerEl = document.getElementById("vote-timer-display");
        if (timerEl) {
            const timeLeft = data.voteTimeLeft !== undefined ? data.voteTimeLeft : 15;
            timerEl.innerText = `残り ${timeLeft}秒`;
        }

        if (isHost && !playedVoteRounds.includes(data.currentRound)) {
            playedVoteRounds.push(data.currentRound);
            startVoteTimer(15);
        }
        
        const endBtn = document.getElementById("end-vote-btn");
        const progressMsg = document.getElementById("host-vote-progress");
        
        if (isHost && data.allowViewers) {
            if (endBtn) {
                endBtn.style.display = "inline-block";
                endBtn.innerText = "投票を締め切って結果へ（スキップ）";
            }
            if (progressMsg) {
                progressMsg.style.display = "block";
                progressMsg.innerText = `📺 プレイヤー投票進捗: ${data.voteCount || 0} / ${activeUsers.length} 完了\n観客も投票中です！時間経過で自動進行します。`;
            }
        } else {
            if (endBtn) endBtn.style.display = "none";
            if (progressMsg) progressMsg.style.display = "none";
            if (isHost && data.voteCount >= activeUsers.length) {
                if (voteTimerInterval) { clearInterval(voteTimerInterval); voteTimerInterval = null; }
                processVoteEnd(data);
            }
        }
    }
    else if (currentLocalScreen === "round_result") {
        isProcessingAction = false;
        document.getElementById("rr-round-num").innerText = data.currentRound;
        document.getElementById("rr-odai").innerText = `お題：${data.odai}`;

        const list = document.getElementById("rr-list");
        const sortedAnswers = [...data.answers].sort((a, b) => b.votes - a.votes);
        list.innerHTML = sortedAnswers.map((ans, i) => {
            const user = data.users.find(u => u.id === ans.userId);
            return `<div class="result-item"><strong>${i+1}位 (${ans.votes}票):</strong> ${user ? renderIcon(user.icon) : ''} ${escapeHTML(ans.userName)}<br><span style="font-size: 1.2em; display:block; margin-top:5px; margin-bottom:5px;">「${escapeHTML(ans.text)}」</span></div>`;
        }).join("");

        const timerEl = document.getElementById("rr-timer-display");
        if (timerEl) {
            const timeLeft = data.roundResultTimeLeft !== undefined ? data.roundResultTimeLeft : 10;
            timerEl.innerText = `残り ${timeLeft}秒`;
        }

        if (isHost && !playedRoundResultRounds.includes(data.currentRound)) {
            playedRoundResultRounds.push(data.currentRound);
            startRoundResultTimer(10);
        }

        const me = data.users.find(u => u.id === myId);
        const nextBtn = document.getElementById("rr-next-btn");
        const waitMsg = document.getElementById("rr-wait-msg");
        
        if (isViewer) {
            nextBtn.style.display = "none";
            waitMsg.style.display = "block";
            waitMsg.innerText = "プレイヤーが次へ進むのを待っています...";
        } else {
            if (me && me.isReady) {
                nextBtn.style.display = "none";
                waitMsg.style.display = "block";
                waitMsg.innerText = "他のプレイヤーを待っています...";
            } else {
                nextBtn.style.display = "inline-block";
                waitMsg.style.display = "none";
            }
        }

        if (isHost) {
            const allReady = activeUsers.every(u => u.isReady);
            if (allReady) {
                if (roundResultTimerInterval) { clearInterval(roundResultTimerInterval); roundResultTimerInterval = null; }
                processRoundResultEnd(data);
            }
        }
    }
    else if (currentLocalScreen === "result") {
        renderFinalResults(data);
        
        const resStamps = document.getElementById("result-stamps");
        if (resStamps) resStamps.style.display = isViewer ? "none" : "flex";
    }
}

// 🌟 消えていた重要関数群を復旧！
async function updateRoomSettings(field, val) { 
    if (!isHost) return; 
    const update = {}; 
    update[field] = (typeof val === "boolean") ? val : parseInt(val); 
    await updateDoc(doc(db, "rooms", roomCode), update); 
}

async function toggleReady() { 
    playButtonSound(); 
    const newUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isReady: !u.isReady } : u); 
    await updateDoc(doc(db, "rooms", roomCode), { users: newUsers }); 
}

async function startGame() {
    playButtonSound(); if (!isHost) return;
    const participants = latestRoomData.users.filter(u => !u.isExited).map(u => ({ ...u, isReady: false, totalScore: 0, lastReaction: "", reactionTime: 0 }));
    const nextOdai = pickUniqueOdai([]);
    await updateDoc(doc(db, "rooms", roomCode), {
        status: "playing", users: participants, currentRound: 1, answers: [], revealIndex: 0, timeLeft: latestRoomData.timeLimit, voteCount: 0,
        odai: nextOdai.text, usedOdaiIndices: nextOdai.newUsedIndices, allAnswersHistory: []
    });
    setTimeout(() => { if (isHost && latestRoomData.status === "playing") startTimer(latestRoomData.timeLimit); }, 4000);
}

function startTimer(duration) {
    if (timerInterval) clearInterval(timerInterval);
    let time = duration;
    timerInterval = setInterval(() => { time--; if (isHost) updateDoc(doc(db, "rooms", roomCode), { timeLeft: time }); if (time <= 0) { clearInterval(timerInterval); if (isHost) goToReveal(); } }, 1000);
}

async function submitAnswer() {
    const text = document.getElementById("my-answer").value; if(!text || isProcessingAction) return;
    playButtonSound(); isProcessingAction = true; document.getElementById("submit-btn").disabled = true;
    await updateDoc(doc(db, "rooms", roomCode), { answers: arrayUnion({ userId: myId, userName: myName, text: text, votes: 0, reactions: 0 }) });
    document.getElementById("my-answer").value = "";
}

async function goToReveal() { 
    if (timerInterval) clearInterval(timerInterval); if (!isHost) return; 
    const currentAnswers = latestRoomData.answers || []; 
    if (currentAnswers.length === 0) processVoteEnd(latestRoomData); 
    else { 
        await updateDoc(doc(db, "rooms", roomCode), { status: "reveal_standby" });
        setTimeout(() => { if (isHost && latestRoomData.status === "reveal_standby") updateDoc(doc(db, "rooms", roomCode), { status: "revealing", revealIndex: 0 }); }, 2000);
    } 
}

async function nextReveal() { 
    playButtonSound(); 
    if (revealCountdownTimer) { clearInterval(revealCountdownTimer); revealCountdownTimer = null; } 
    await updateDoc(doc(db, "rooms", roomCode), { revealIndex: latestRoomData.revealIndex + 1 }); 
}
// 🌟 復旧ここまで！

function renderVoteList(data) {
    const list = document.getElementById("vote-list"); list.innerHTML = ""; 
    const activeUsers = data.users.filter(u => !u.isExited);
    
    const votableAnswers = data.answers.filter(a => activeUsers.some(u => u.id === a.userId));
    
    if (votableAnswers.length === 0 || hasVoted) { 
        if (!hasVoted && votableAnswers.length === 0) { 
            hasVoted = true; 
            if(!isViewer) updateDoc(doc(db, "rooms", roomCode), { voteCount: data.voteCount + 1 }); 
        } 
        document.getElementById("vote-wait-msg").style.display = "block"; return; 
    }
    document.getElementById("vote-wait-msg").style.display = "none";
    
    votableAnswers.forEach(ans => {
        const btn = document.createElement("button"); btn.className = "vote-item"; btn.innerText = ans.text;
        btn.onclick = async () => { 
            if (isProcessingAction) return; 
            playVoteSound(); isProcessingAction = true; hasVoted = true; 
            const newAns = data.answers.map(a => a.userId === ans.userId ? {...a, votes: a.votes + 1} : a); 
            const updatePayload = { answers: newAns };
            if (!isViewer) updatePayload.voteCount = data.voteCount + 1;
            await updateDoc(doc(db, "rooms", roomCode), updatePayload); 
        };
        list.appendChild(btn);
    });
}

let isEndingVote = false;
async function processVoteEnd(data) {
    if (!isHost || isEndingVote) return;
    isEndingVote = true;
    if (voteTimerInterval) { clearInterval(voteTimerInterval); voteTimerInterval = null; }
    
    const updatedUsers = data.users.map(u => { const ans = data.answers.find(a => a.userId === u.id); return { ...u, totalScore: (u.totalScore || 0) + (ans ? ans.votes : 0), isReady: false }; });
    const updatedHistory = [...(data.allAnswersHistory || []), ...data.answers.map(a => ({...a, odai: data.odai}))];
    
    if (data.totalRounds === 1) {
        await updateDoc(doc(db, "rooms", roomCode), { status: "result", users: updatedUsers, allAnswersHistory: updatedHistory });
    } else {
        await updateDoc(doc(db, "rooms", roomCode), { status: "round_result", users: updatedUsers, allAnswersHistory: updatedHistory, roundResultTimeLeft: 10 });
    }
    
    setTimeout(() => { isEndingVote = false; }, 2000); 
}

let isEndingRoundResult = false;
async function processRoundResultEnd(data) {
    if (!isHost || isEndingRoundResult) return;
    isEndingRoundResult = true;
    if (roundResultTimerInterval) { clearInterval(roundResultTimerInterval); roundResultTimerInterval = null; }

    const updatedUsers = data.users.map(u => ({ ...u, isReady: false, lastReaction: "", reactionTime: 0 }));

    if (data.currentRound < data.totalRounds) {
        const nextOdai = pickUniqueOdai(data.usedOdaiIndices || []);
        await updateDoc(doc(db, "rooms", roomCode), { status: "playing", users: updatedUsers, currentRound: data.currentRound + 1, answers: [], revealIndex: 0, voteCount: 0, timeLeft: data.timeLimit, odai: nextOdai.text, usedOdaiIndices: nextOdai.newUsedIndices, voteTimeLeft: 15 });
        setTimeout(() => { if (isHost && latestRoomData.status === "playing") startTimer(data.timeLimit); }, 4000);
    } else {
        await updateDoc(doc(db, "rooms", roomCode), { status: "result", users: updatedUsers });
    }

    setTimeout(() => { isEndingRoundResult = false; }, 2000);
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

function shareToX() {
    playButtonSound();
    const mvpAnswer = document.getElementById("mvp-answer").innerText, mvpOdai = document.getElementById("mvp-odai").innerText;
    let shareText = `【with!大喜利】結果発表！\n`; if (mvpAnswer && mvpAnswer !== "...") shareText += `🏆今回のMVP回答：${mvpAnswer}\n（${mvpOdai}）\n\n`;
    shareText += `#with大喜利\n`; const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent("https://zetsubouinu.github.io/ZetsubouInu/")}`; window.open(xUrl, '_blank');
}

async function goBackToWait() { 
    playButtonSound(); currentLocalScreen = "wait"; playedCountdownRounds = []; playedRevealRounds = []; playedVoteRounds = []; playedRoundResultRounds = []; isCountdownActive = false; updateUI(latestRoomData); 
    if (!isViewer) {
        const updatedUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isReady: false, isExited: false, lastReaction: "", reactionTime: 0 } : u);
        const updateData = { users: updatedUsers }; if (isHost) updateData.status = "waiting";
        await updateDoc(doc(db, "rooms", roomCode), updateData); 
    }
}

async function exitGame() { 
    playButtonSound(); 
    if (latestRoomData && !isViewer) { 
        const activeOthers = latestRoomData.users.filter(u => u.id !== myId && !u.isExited);
        if (activeOthers.length === 0) await deleteDoc(doc(db, "rooms", roomCode));
        else {
            const updatedUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isExited: true, isReady: false } : u); 
            await updateDoc(doc(db, "rooms", roomCode), { users: updatedUsers }); 
        }
    } 
    location.reload(); 
}

async function sendStamp(type) {
    if (isViewer) return; 
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

// 🌟 伏せ字（*****）のままでも正しくルームコードがコピーできる仕様に戻しました
function copyRoomCode() { 
    if (!roomCode) return; 
    const codeStr = String(roomCode);
    navigator.clipboard.writeText(codeStr).then(() => { 
        const toast = document.getElementById("copy-toast"); 
        if(toast) {
            toast.innerText = "コピー完了";
            toast.className = "show"; 
            setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 2000); 
        }
    }).catch(err => console.error("Clipboard Error:", err)); 
}

function toggleRoomCode() { 
    const display = document.getElementById("display-code"); 
    if(!display) return;
    const codeStr = String(roomCode);
    display.innerText = (display.innerText === "*****") ? codeStr : "*****"; 
}