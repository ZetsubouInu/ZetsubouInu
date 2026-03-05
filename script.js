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

let currentRevealingAnswerIndex = -1;
let typeWriterTimer = null;
let playedCountdownRounds = []; 
let playedRevealRounds = []; 
let revealCountdownTimer = null; 

const icons = ['🐱', '🐶', '🦊', '🐈', '🐯', '🦁', '🐰', '🐻'];

// --- 🌟 効果音・BGMの読み込みと設定 ---
const reactionSound = new Audio("reaction.mp3");
const limitSound = new Audio("limit10.mp3");
limitSound.loop = true; 

const voiceCountdown = new Audio("321voice.mp3");

const buttonSound = new Audio("button.mp3");
const voteSound = new Audio("vote.mp3");

const bgmMain = new Audio("bgm_main.mp3");
bgmMain.loop = true; 
bgmMain.volume = 0;  

const bgmBattle = new Audio("bgm_battle.mp3");
bgmBattle.loop = true;
bgmBattle.volume = 0;

const bgmVote = new Audio("bgm_vote.mp3");
bgmVote.loop = true;
bgmVote.volume = 0;

let isMainBgmPlaying = false;
let isBattleBgmPlaying = false;
let isVoteBgmPlaying = false; 
let hasUserInteracted = false;
let isCountdownActive = false; 

const BASE_BGM_VOLUME = 0.3; 
const BASE_SE_VOLUME = 0.6; 

let bgmFactor = 0.4; 
let seFactor = 0.4; 

function playButtonSound() {
    const playSound = buttonSound.cloneNode();
    playSound.volume = seFactor * BASE_SE_VOLUME;
    playSound.play().catch(() => {});
}

function playVoteSound() {
    const playSound = voteSound.cloneNode();
    playSound.volume = seFactor * BASE_SE_VOLUME;
    playSound.play().catch(() => {});
}

function fadeAudio(audio, targetScreenFactor, duration) {
    if (audio.fadeInterval) {
        clearInterval(audio.fadeInterval);
        audio.fadeInterval = null;
    }
    const steps = 30;
    const stepTime = duration / steps;
    
    const targetActualVol = targetScreenFactor * bgmFactor * BASE_BGM_VOLUME;
    const volStep = (targetActualVol - audio.volume) / steps;

    if (targetScreenFactor > 0 && audio.paused) {
        audio.play().catch(e => console.log("再生ブロック:", e));
    }

    audio.fadeInterval = setInterval(() => {
        let newVol = audio.volume + volStep;
        if ((volStep > 0 && newVol >= targetActualVol) || (volStep < 0 && newVol <= targetActualVol)) {
            newVol = targetActualVol;
            clearInterval(audio.fadeInterval);
            audio.fadeInterval = null;
            if (targetActualVol === 0) audio.pause();
        }
        audio.volume = Math.max(0, Math.min(1, newVol));
    }, stepTime);
}

function manageBgm(screen) {
    if (!hasUserInteracted) return;
    
    const mainBgmScreens = ["home", "wait", "result"];
    const battleBgmScreens = ["playing"];
    const voteBgmScreens = ["revealing", "voting"];

    if (mainBgmScreens.includes(screen)) {
        isMainBgmPlaying = true;
        isBattleBgmPlaying = false;
        isVoteBgmPlaying = false;
        fadeAudio(bgmMain, 1, 1000); 
        fadeAudio(bgmBattle, 0, 1000); 
        fadeAudio(bgmVote, 0, 1000);
    } 
    else if (battleBgmScreens.includes(screen)) {
        isMainBgmPlaying = false;
        isBattleBgmPlaying = !isCountdownActive; 
        isVoteBgmPlaying = false;
        fadeAudio(bgmMain, 0, 1000); 
        fadeAudio(bgmVote, 0, 1000); 

        if (isCountdownActive) {
            fadeAudio(bgmBattle, 0, 500); 
        } else {
            fadeAudio(bgmBattle, 1, 1000);
        }
    } 
    else if (screen === "reveal_standby") {
        isMainBgmPlaying = false;
        isBattleBgmPlaying = false;
        isVoteBgmPlaying = false;
        fadeAudio(bgmMain, 0, 1000);
        fadeAudio(bgmBattle, 0, 1000); 
        fadeAudio(bgmVote, 0, 1000);
    } 
    else if (voteBgmScreens.includes(screen)) {
        isMainBgmPlaying = false;
        isBattleBgmPlaying = false;
        isVoteBgmPlaying = true;
        fadeAudio(bgmMain, 0, 1000);
        fadeAudio(bgmBattle, 0, 1000);
        fadeAudio(bgmVote, 1, 1000); 
    }
}

function unlockAudio() {
    if (!hasUserInteracted) {
        hasUserInteracted = true;
        manageBgm(currentLocalScreen);
        document.removeEventListener("click", unlockAudio);
        document.removeEventListener("keydown", unlockAudio);
    }
}
document.addEventListener("click", unlockAudio);
document.addEventListener("keydown", unlockAudio);

function typeWriter(element, text, speed = 190, onComplete = null) {
    if (typeWriterTimer) clearInterval(typeWriterTimer);
    element.innerHTML = ""; 
    const chars = Array.from(text); 
    chars.forEach(char => {
        const span = document.createElement("span");
        span.textContent = char;
        span.style.visibility = "hidden"; 
        element.appendChild(span);
    });
    let i = 0;
    const spans = element.querySelectorAll("span");
    typeWriterTimer = setInterval(() => {
        if (i < spans.length) {
            spans[i].style.visibility = "visible"; 
            i++;
        } else { 
            clearInterval(typeWriterTimer); 
            typeWriterTimer = null; 
            if (onComplete) onComplete(); 
        }
    }, speed);
}

function showCountdown() {
    const overlay = document.getElementById("countdown-overlay");
    const textEl = document.getElementById("countdown-text");
    if (!overlay || !textEl) return;
    overlay.style.display = "flex";
    
    isCountdownActive = true;
    manageBgm(currentLocalScreen); 

    if (hasUserInteracted) {
        voiceCountdown.volume = seFactor * BASE_SE_VOLUME;
        voiceCountdown.currentTime = 0; 
        voiceCountdown.play().catch(e => console.log("再生ブロック:", e));
    }

    let count = 3;
    textEl.innerText = count;
    textEl.setAttribute("data-text", count);
    
    textEl.classList.remove("countdown-anim");
    void textEl.offsetWidth; textEl.classList.add("countdown-anim");
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            textEl.innerText = count;
            textEl.setAttribute("data-text", count);
            
            textEl.classList.remove("countdown-anim");
            void textEl.offsetWidth; textEl.classList.add("countdown-anim");
        } else if (count === 0) {
            textEl.style.fontSize = "min(12vw, 120px)"; 
            textEl.innerText = "START!";
            textEl.setAttribute("data-text", "START!");
            
            textEl.classList.remove("countdown-anim");
            void textEl.offsetWidth; textEl.classList.add("countdown-anim");
        } else { 
            clearInterval(interval); 
            overlay.style.display = "none"; 
            textEl.style.fontSize = ""; 
            
            isCountdownActive = false;
            manageBgm(currentLocalScreen);
        }
    }, 1000);
}

function showAnnouncement(text) {
    const overlay = document.getElementById("countdown-overlay");
    const textEl = document.getElementById("countdown-text");
    if (!overlay || !textEl) return;
    overlay.style.display = "flex";
    
    isCountdownActive = true; 
    manageBgm(currentLocalScreen);

    textEl.style.fontSize = "min(10vw, 100px)"; 
    textEl.innerText = text;
    textEl.setAttribute("data-text", text);
    
    textEl.classList.remove("countdown-anim");
    void textEl.offsetWidth; 
    textEl.classList.add("countdown-anim");

    textEl.style.animationDuration = "2s";
    textEl.style.animationFillMode = "forwards";

    setTimeout(() => {
        overlay.style.display = "none";
        textEl.style.fontSize = ""; 
        textEl.style.animationDuration = "";
        textEl.style.animationFillMode = "";
        
        isCountdownActive = false; 
        manageBgm(currentLocalScreen);
    }, 2000); 
}

function startRevealCountdown(data) {
    const timerEl = document.getElementById("reveal-timer-display");
    if (!timerEl) return;
    
    const isLastAnswer = data.revealIndex >= data.answers.length - 1;
    const baseText = isLastAnswer ? "投票に移るまで残り" : "次の回答まで残り";
    
    let timeLeft = 15;
    timerEl.innerText = `（${baseText} ${timeLeft}秒）`;
    timerEl.style.display = "block";
    
    if (revealCountdownTimer) clearInterval(revealCountdownTimer);
    
    revealCountdownTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            timerEl.innerText = `（${baseText} ${timeLeft}秒）`;
        } else {
            clearInterval(revealCountdownTimer);
            timerEl.style.display = "none";
            if (isHost) {
                nextReveal();
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
    function updateSliderBg(slider) {
        const val = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.background = `linear-gradient(to right, #ffd700 ${val}%, #ddd ${val}%)`;
    }

    const toggleBtn = document.getElementById("volume-toggle-btn");
    const panel = document.getElementById("volume-panel");
    if (toggleBtn && panel) {
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            panel.classList.toggle("active");
        };
        document.addEventListener("click", () => panel.classList.remove("active"));
        panel.onclick = (e) => e.stopPropagation();
    }

    const bgmSlider = document.getElementById("bgm-volume");
    if (bgmSlider) {
        bgmSlider.value = bgmFactor; 
        updateSliderBg(bgmSlider); 
        bgmSlider.addEventListener("input", (e) => {
            updateSliderBg(e.target); 
            bgmFactor = parseFloat(e.target.value); 
            
            if (isMainBgmPlaying) {
                if (bgmMain.fadeInterval) { clearInterval(bgmMain.fadeInterval); bgmMain.fadeInterval = null; }
                bgmMain.volume = bgmFactor * BASE_BGM_VOLUME;
            }
            if (isBattleBgmPlaying) {
                if (bgmBattle.fadeInterval) { clearInterval(bgmBattle.fadeInterval); bgmBattle.fadeInterval = null; }
                bgmBattle.volume = bgmFactor * BASE_BGM_VOLUME;
            }
            if (isVoteBgmPlaying) {
                if (bgmVote.fadeInterval) { clearInterval(bgmVote.fadeInterval); bgmVote.fadeInterval = null; }
                bgmVote.volume = bgmFactor * BASE_BGM_VOLUME;
            }
        });
    }

    const seSlider = document.getElementById("se-volume");
    if (seSlider) {
        seSlider.value = seFactor; 
        updateSliderBg(seSlider); 
        seSlider.addEventListener("input", (e) => { 
            updateSliderBg(e.target); 
            seFactor = parseFloat(e.target.value); 
            if (!limitSound.paused) { limitSound.volume = seFactor * BASE_SE_VOLUME; }
            if (!voiceCountdown.paused) { voiceCountdown.volume = seFactor * BASE_SE_VOLUME; }
        });
        seSlider.addEventListener("change", (e) => {
            const playSound = reactionSound.cloneNode();
            playSound.volume = seFactor * BASE_SE_VOLUME; 
            playSound.play().catch(() => {});
        });
    }

    const iconContainer = document.getElementById('home-icon-selector');
    if (iconContainer) {
        icons.forEach((icon, index) => {
            const div = document.createElement('div');
            div.className = `icon-option ${index === 0 ? 'selected' : ''}`;
            div.innerText = icon;
            div.onclick = () => { 
                playButtonSound(); 
                myIcon = icon; 
                document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected')); 
                div.classList.add('selected'); 
            };
            iconContainer.appendChild(div);
        });
    }

    const roundSelect = document.getElementById("round-select");
    if (roundSelect) {
        for(let i=1; i<=10; i++) {
            let opt = document.createElement("option"); opt.value = i; opt.innerText = `${i}問`;
            if(i === 3) opt.selected = true;
            roundSelect.appendChild(opt);
        }
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

    const handleEnter = (e, btnId) => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            const btn = document.getElementById(btnId);
            if (btn && !btn.disabled) btn.click();
        }
    };

    const myAnswerInput = document.getElementById("my-answer");
    // 🌟 回答入力欄のみエンターキー送信を残す
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
});

window.addEventListener("beforeunload", () => {
    if (roomCode && myId && latestRoomData) {
        const updatedUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isExited: true, isReady: false } : u);
        updateDoc(doc(db, "rooms", roomCode), { users: updatedUsers });
    }
});

async function createRoom() {
    playButtonSound(); 
    roomCode = Math.floor(10000 + Math.random() * 90000).toString();
    myName = document.getElementById("name-input").value.substring(0, 10) || "名無し";
    myId = generateId(); isHost = true; currentLocalScreen = "wait";
    playedCountdownRounds = []; 
    playedRevealRounds = []; 
    await setDoc(doc(db, "rooms", roomCode), {
        status: "waiting", users: [{ id: myId, name: myName, icon: myIcon, isReady: false, lastReaction: "", reactionTime: 0, totalScore: 0, isExited: false }], 
        hostId: myId, originalHostId: myId, odai: "", usedOdaiIndices: [], answers: [], revealIndex: 0, timeLeft: 60, voteCount: 0,
        currentRound: 0, totalRounds: 3, maxUsers: 8, timeLimit: 60, allAnswersHistory: []
    });
    setupRoomListener();
}

async function joinRoom() {
    playButtonSound(); 
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
    playedCountdownRounds = []; 
    playedRevealRounds = []; 
    await updateDoc(roomRef, { users: arrayUnion({ id: myId, name: myName, icon: myIcon, isReady: false, lastReaction: "", reactionTime: 0, totalScore: 0, isExited: false }) });
    setupRoomListener();
}

function setupRoomListener() {
    onSnapshot(doc(db, "rooms", roomCode), async (docSnap) => {
        if (!docSnap.exists()) return;
        latestRoomData = docSnap.data();
        const activeUsers = latestRoomData.users.filter(u => !u.isExited);
        const currentHost = activeUsers.find(u => u.id === latestRoomData.hostId);
        if (!currentHost && activeUsers.length > 0) {
            await updateDoc(doc(db, "rooms", roomCode), { hostId: activeUsers[0].id });
            return;
        }
        isHost = (latestRoomData.hostId === myId);
        
        if (latestRoomData.status === "waiting") {
            if (currentLocalScreen !== "home" && currentLocalScreen !== "result") currentLocalScreen = "wait";
        } else if (["playing", "reveal_standby", "revealing", "voting"].includes(latestRoomData.status)) {
            currentLocalScreen = latestRoomData.status;
        } else if (latestRoomData.status === "result") {
            if (currentLocalScreen !== "home" && currentLocalScreen !== "wait") currentLocalScreen = "result";
        }
        updateUI(latestRoomData);
    });
}

function updateUI(data) {
    if (currentLocalScreen === "playing" && !playedCountdownRounds.includes(data.currentRound)) {
        playedCountdownRounds.push(data.currentRound);
        showCountdown();
    }

    manageBgm(currentLocalScreen);
    
    if (currentLocalScreen !== "playing") {
        if (!limitSound.paused) {
            limitSound.pause();
            limitSound.currentTime = 0; 
        }
    }

    if (currentLocalScreen !== "revealing" && revealCountdownTimer) {
        clearInterval(revealCountdownTimer);
        revealCountdownTimer = null;
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const activeUsers = data.users.filter(u => !u.isExited);
    const bottomBar = document.getElementById("bottom-users");
    if (currentLocalScreen !== "home") {
        bottomBar.style.display = "flex";
        const answerStatus = (data.answers || []).map(a => a.userId).sort().join(",");
        const currentSignature = activeUsers.length + "_" + answerStatus + "_" + data.status + "_" + currentLocalScreen;
        if (bottomBar.dataset.signature !== currentSignature) {
            bottomBar.dataset.signature = currentSignature;
            bottomBar.innerHTML = activeUsers.map(u => {
                const hasAnswered = data.answers && data.answers.some(a => a.userId === u.id);
                const checkMark = ((currentLocalScreen === "playing" || currentLocalScreen === "reveal_standby") && hasAnswered) ? `<div style=\"position:absolute; top:-5px; right:-5px; background:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border:2px solid #1a1a1a; z-index:10; font-size:12px; box-shadow:0 2px 5px rgba(0,0,0,0.2);\">✅</div>` : "";
                return `<div class=\"user-icon-stack\" id=\"stack-${u.id}\" style=\"position:relative;\">${checkMark}<div class=\"bubble\" id=\"bubble-${u.id}\"></div><div class=\"icon\">${renderIcon(u.icon)}</div><div>${escapeHTML(u.name.substring(0, 10))}${u.id === myId ? '<br>(あなた)' : ''}</div></div>`;
            }).join("");
        }
        data.users.forEach(u => {
            if (u.reactionTime) {
                if (lastKnownReactionTimes[u.id] === undefined) {
                    lastKnownReactionTimes[u.id] = u.reactionTime;
                } 
                else if (u.reactionTime !== lastKnownReactionTimes[u.id]) {
                    lastKnownReactionTimes[u.id] = u.reactionTime;
                    const bubble = document.getElementById(`bubble-${u.id}`);
                    if (bubble) {
                        bubble.innerText = u.lastReaction;
                        bubble.classList.remove("show"); void bubble.offsetWidth; bubble.classList.add("show");
                        const playSound = reactionSound.cloneNode();
                        playSound.volume = seFactor * BASE_SE_VOLUME;
                        playSound.play().catch(() => {});
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
        const hostMsg = document.getElementById("host-msg"); if (hostMsg) hostMsg.style.display = isHost ? "block" : "none";
        document.getElementById("room-settings-area").style.display = "block"; 
        document.getElementById("start-btn-container").style.display = isHost ? "inline-block" : "none";
        document.getElementById("guest-msg").style.display = isHost ? "none" : "block";
        const maxSelect = document.getElementById("max-users-select"); const timeSelect = document.getElementById("time-select"); const rSelect = document.getElementById("round-select");
        maxSelect.value = data.maxUsers || 8; timeSelect.value = data.timeLimit || 60; rSelect.value = data.totalRounds || 3;
        maxSelect.disabled = !isHost; timeSelect.disabled = !isHost; rSelect.disabled = !isHost;
        if (isHost) { const allReady = activeUsers.length >= 2 && activeUsers.every(u => u.isReady); document.getElementById("start-btn-container").disabled = !allReady; }
    } 
    else if (currentLocalScreen === "playing") {
        isProcessingAction = false; hasVoted = false; currentRevealingAnswerIndex = -1; 
        
        document.getElementById("round-display").innerText = `第 ${data.currentRound} / ${data.totalRounds} ラウンド`;
        document.getElementById("current-odai").innerText = data.odai;
        
        const timerDisplay = document.getElementById("timer-display");
        timerDisplay.innerText = `残り ${data.timeLeft}秒`;
        
        if (data.timeLeft <= 10 && data.timeLeft > 0) {
            timerDisplay.style.color = "red"; 
            if (limitSound.paused && hasUserInteracted) {
                limitSound.volume = seFactor * BASE_SE_VOLUME; 
                limitSound.play().catch(e => console.log("再生ブロック:", e));
            }
        } else {
            timerDisplay.style.color = "#1a1a1a"; 
        }

        const sent = data.answers.some(a => a.userId === myId);
        document.getElementById("submit-btn").disabled = sent;
        document.getElementById("playing-wait-msg").style.display = sent ? "block" : "none";
        if (isHost && (data.answers.length >= activeUsers.length || data.timeLeft <= 0)) goToReveal();
    } 
    else if (currentLocalScreen === "reveal_standby") {
        document.getElementById("round-display").innerText = `第 ${data.currentRound} / ${data.totalRounds} ラウンド`;
        document.getElementById("current-odai").innerText = data.odai;
        const timerDisplay = document.getElementById("timer-display");
        timerDisplay.innerText = `終了！`;
        timerDisplay.style.color = "red";
        
        document.getElementById("submit-btn").disabled = true;
        
        if (!playedRevealRounds.includes(data.currentRound)) {
            playedRevealRounds.push(data.currentRound);
            showAnnouncement("回答発表！");
        }
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
                
                typeWriter(document.getElementById("answer-display-inner"), ans.text, 190, () => {
                    startRevealCountdown(data);
                }); 
            }
            document.getElementById("author-name").innerText = `回答者: ${escapeHTML(ans.userName)}`;
            
            const nextBtn = document.getElementById("next-reveal-btn");
            if (data.revealIndex >= data.answers.length - 1) {
                nextBtn.innerText = "投票画面へ進む";
            } else {
                nextBtn.innerText = "次の回答へ";
            }
            nextBtn.style.display = isHost ? "block" : "none";
            
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
async function toggleReady() { 
    playButtonSound(); 
    const newUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isReady: !u.isReady } : u); 
    await updateDoc(doc(db, "rooms", roomCode), { users: newUsers }); 
}
async function startGame() {
    playButtonSound(); 
    if (!isHost) return;
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
    playButtonSound(); 
    isProcessingAction = true; document.getElementById("submit-btn").disabled = true;
    await updateDoc(doc(db, "rooms", roomCode), { answers: arrayUnion({ userId: myId, userName: myName, text: text, votes: 0, reactions: 0 }) });
    document.getElementById("my-answer").value = "";
}

async function goToReveal() { 
    if (timerInterval) clearInterval(timerInterval); 
    if (!isHost) return; 
    const currentAnswers = latestRoomData.answers || []; 
    if (currentAnswers.length === 0) {
        processVoteEnd(latestRoomData); 
    } else { 
        await updateDoc(doc(db, "rooms", roomCode), { status: "reveal_standby" });
        setTimeout(() => {
            if (isHost && latestRoomData.status === "reveal_standby") {
                updateDoc(doc(db, "rooms", roomCode), { status: "revealing", revealIndex: 0 }); 
            }
        }, 2000);
    } 
}

async function nextReveal() { 
    playButtonSound(); 
    if (revealCountdownTimer) {
        clearInterval(revealCountdownTimer);
        revealCountdownTimer = null;
    }
    await updateDoc(doc(db, "rooms", roomCode), { revealIndex: latestRoomData.revealIndex + 1 }); 
}

function renderVoteList(data) {
    const list = document.getElementById("vote-list"); list.innerHTML = ""; const activeUsers = data.users.filter(u => !u.isExited);
    const others = data.answers.filter(a => a.userId !== myId && activeUsers.some(u => u.id === a.userId));
    if (others.length === 0 || hasVoted) { if (!hasVoted && others.length === 0) { hasVoted = true; updateDoc(doc(db, "rooms", roomCode), { voteCount: data.voteCount + 1 }); } document.getElementById("vote-wait-msg").style.display = "block"; return; }
    document.getElementById("vote-wait-msg").style.display = "none";
    others.forEach(ans => {
        const btn = document.createElement("button"); btn.className = "vote-item"; btn.innerText = ans.text;
        btn.onclick = async () => { 
            if (isProcessingAction) return; 
            playVoteSound(); 
            isProcessingAction = true; hasVoted = true; const newAns = data.answers.map(a => a.userId === ans.userId ? {...a, votes: a.votes + 1} : a); await updateDoc(doc(db, "rooms", roomCode), { answers: newAns, voteCount: data.voteCount + 1 }); 
        };
        list.appendChild(btn);
    });
}
function renderFinalResults(data) {
    const list = document.getElementById("result-list"); const sorted = [...data.users].sort((a,b) => (b.totalScore || 0) - (a.totalScore || 0));
    list.innerHTML = sorted.map((u, i) => `<div class=\"result-item\"><strong>${i+1}位 (${u.totalScore || 0}pt):</strong> ${renderIcon(u.icon)} ${escapeHTML(u.name.substring(0, 10))}${u.id === myId ? ' (あなた)' : ''} ${u.isExited ? '<small>(退出済)</small>' : ''}</div>`).join("");
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
        setTimeout(() => { if (isHost && latestRoomData.status === "playing") startTimer(data.timeLimit); }, 4000);
    } else await updateDoc(doc(db, "rooms", roomCode), { status: "result", users: updatedUsers, allAnswersHistory: updatedHistory });
}
function shareToX() {
    playButtonSound();
    const mvpAnswer = document.getElementById("mvp-answer").innerText, mvpOdai = document.getElementById("mvp-odai").innerText;
    let shareText = `【with!大喜利】結果発表！\n`; if (mvpAnswer && mvpAnswer !== "...") shareText += `🏆今回のMVP回答：${mvpAnswer}\n（${mvpOdai}）\n\n`;
    shareText += `#with大喜利\n`; const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent("https://zetsubouinu.github.io/ZetsubouInu/")}`; window.open(xUrl, '_blank');
}
async function goBackToWait() { 
    playButtonSound(); 
    currentLocalScreen = "wait"; 
    playedCountdownRounds = []; 
    playedRevealRounds = []; 
    isCountdownActive = false; 
    updateUI(latestRoomData); 
    const updatedUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isReady: false, isExited: false, lastReaction: "", reactionTime: 0 } : u);
    const updateData = { users: updatedUsers }; if (isHost) updateData.status = "waiting";
    await updateDoc(doc(db, "rooms", roomCode), updateData); 
}
async function exitGame() { 
    playButtonSound(); 
    if (latestRoomData) { const updatedUsers = latestRoomData.users.map(u => u.id === myId ? { ...u, isExited: true, isReady: false } : u); await updateDoc(doc(db, "rooms", roomCode), { users: updatedUsers }); } 
    location.reload(); 
}
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
function toggleRoomCode() { const display = document.getElementById("display-code"); display.innerText = (display.innerText === "*****") ? roomCode : "*****"; }