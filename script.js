import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const pages = {
  welcomePage: document.getElementById("welcomePage"),
  hostPage: document.getElementById("hostPage"),
  playerPage: document.getElementById("playerPage"),
};

const firebaseStatus = document.getElementById("firebaseStatus");
const createRoomButton = document.getElementById("createRoomButton");
const showJoinButton = document.getElementById("showJoinButton");
const joinBox = document.getElementById("joinBox");
const joinRoomCodeInput = document.getElementById("joinRoomCodeInput");
const joinNameInput = document.getElementById("joinNameInput");
const joinRoomButton = document.getElementById("joinRoomButton");
const joinError = document.getElementById("joinError");
const hostRoomCode = document.getElementById("hostRoomCode");
const playerList = document.getElementById("playerList");
const playerSummary = document.getElementById("playerSummary");
const playerCountInput = document.getElementById("playerCount");
const roleInputs = Array.from(document.querySelectorAll(".role-input"));
const roleSummary = document.getElementById("roleSummary");
const setupError = document.getElementById("setupError");
const autoRolesButton = document.getElementById("autoRolesButton");
const assignButton = document.getElementById("assignButton");
const playerRoomLabel = document.getElementById("playerRoomLabel");
const playerNameLabel = document.getElementById("playerNameLabel");
const privateRole = document.getElementById("privateRole");
const playerStatus = document.getElementById("playerStatus");
const revealRoleButton = document.getElementById("revealRoleButton");
const timerPreset = document.getElementById("timerPreset");
const timerDisplay = document.getElementById("timerDisplay");
const timerStartButton = document.getElementById("timerStartButton");
const timerPauseButton = document.getElementById("timerPauseButton");
const timerResetButton = document.getElementById("timerResetButton");

let app;
let auth;
let db;
let currentUser = null;
let currentRoomId = "";
let currentPlayers = [];
let ownRole = "";
let roleVisible = false;
let playerUnsubscribe = null;
let ownPlayerUnsubscribe = null;
let timerSeconds = Number(timerPreset.value);
let timerId = null;

function showPage(pageId) {
  Object.values(pages).forEach((page) => page.classList.remove("page--active"));
  pages[pageId].classList.add("page--active");
}

function isFirebaseConfigReady() {
  return firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_");
}

function setStatus(message, isError = false) {
  firebaseStatus.textContent = message;
  firebaseStatus.classList.toggle("is-error", isError);
}

async function startFirebase() {
  if (!isFirebaseConfigReady()) {
    setStatus("firebase-config.js にFirebase設定を入れてください。", true);
    createRoomButton.disabled = true;
    joinRoomButton.disabled = true;
    return;
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      setStatus("Firebase接続OK");
      createRoomButton.disabled = false;
      joinRoomButton.disabled = false;
    }
  });

  await signInAnonymously(auth);
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function getRoomRef(roomId) {
  return doc(db, "rooms", roomId);
}

function getPlayersRef(roomId) {
  return collection(db, "rooms", roomId, "players");
}

function getPlayerRef(roomId, uid) {
  return doc(db, "rooms", roomId, "players", uid);
}

async function createRoom() {
  if (!currentUser) {
    setStatus("Firebaseログイン中です。少し待ってください。", true);
    return;
  }

  currentRoomId = makeRoomCode();
  await setDoc(getRoomRef(currentRoomId), {
    hostUid: currentUser.uid,
    status: "waiting",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  localStorage.setItem("werewolfRoomId", currentRoomId);
  localStorage.setItem("werewolfMode", "host");
  hostRoomCode.textContent = currentRoomId;
  listenPlayers();
  showPage("hostPage");
}

async function joinRoom() {
  const roomId = joinRoomCodeInput.value.trim().toUpperCase();
  const playerName = joinNameInput.value.trim();

  if (!currentUser) {
    joinError.textContent = "Firebaseログイン中です。少し待ってください。";
    return;
  }

  if (roomId.length !== 6) {
    joinError.textContent = "6文字の部屋コードを入力してください。";
    return;
  }

  if (playerName === "") {
    joinError.textContent = "名前を入力してください。";
    return;
  }

  const roomSnap = await getDoc(getRoomRef(roomId));
  if (!roomSnap.exists()) {
    joinError.textContent = "その部屋は見つかりません。";
    return;
  }

  currentRoomId = roomId;
  const playerRef = getPlayerRef(roomId, currentUser.uid);
  const playerSnap = await getDoc(playerRef);

  if (playerSnap.exists()) {
    await updateDoc(playerRef, {
      name: playerName,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(playerRef, {
      uid: currentUser.uid,
      name: playerName,
      role: "",
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  localStorage.setItem("werewolfRoomId", roomId);
  localStorage.setItem("werewolfMode", "player");
  localStorage.setItem("werewolfPlayerName", playerName);
  joinError.textContent = "";
  listenOwnRole(playerName);
  showPage("playerPage");
}

function listenPlayers() {
  if (playerUnsubscribe) {
    playerUnsubscribe();
  }

  const playersQuery = query(getPlayersRef(currentRoomId), orderBy("joinedAt", "asc"));
  playerUnsubscribe = onSnapshot(playersQuery, (snapshot) => {
    currentPlayers = snapshot.docs.map((playerDoc) => ({
      id: playerDoc.id,
      ...playerDoc.data(),
    }));
    renderPlayerList();
    setRecommendedRoles();
  }, () => {
    setupError.textContent = "参加者データの受信に失敗しました。Firestoreルールを確認してください。";
  });
}

function listenOwnRole(playerName) {
  if (ownPlayerUnsubscribe) {
    ownPlayerUnsubscribe();
  }

  playerRoomLabel.textContent = `部屋コード ${currentRoomId}`;
  playerNameLabel.textContent = playerName;
  privateRole.textContent = "配布待ち";
  privateRole.classList.add("is-waiting");
  roleVisible = false;
  ownRole = "";

  ownPlayerUnsubscribe = onSnapshot(getPlayerRef(currentRoomId, currentUser.uid), (snapshot) => {
    if (!snapshot.exists()) {
      playerStatus.textContent = "参加者データが見つかりません。もう一度入室してください。";
      return;
    }

    const player = snapshot.data();
    playerNameLabel.textContent = player.name;
    ownRole = player.role || "";

    if (ownRole === "") {
      privateRole.textContent = "配布待ち";
      privateRole.classList.add("is-waiting");
      playerStatus.textContent = "主催者が役職を配るまで、この画面で待ってください。";
      roleVisible = false;
      return;
    }

    privateRole.classList.remove("is-waiting");
    privateRole.textContent = roleVisible ? ownRole : "配布されました";
    playerStatus.textContent = "自分だけがこの役職を確認できます。";
  }, () => {
    playerStatus.textContent = "役職データの受信に失敗しました。";
  });
}

function renderPlayerList() {
  playerList.innerHTML = "";
  playerSummary.textContent = `${currentPlayers.length}人`;
  playerCountInput.value = currentPlayers.length;

  currentPlayers.forEach((player, index) => {
    const item = document.createElement("li");
    item.className = "player-item";

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = `${index + 1}. ${player.name}`;

    const state = document.createElement("span");
    state.className = "player-state";
    state.textContent = player.role ? "送信済み" : "待機中";

    item.append(name, state);
    playerList.appendChild(item);
  });
}

function getPlayerCount() {
  return currentPlayers.length;
}

function getRoleTotal() {
  return roleInputs.reduce((total, input) => total + Number(input.value), 0);
}

function updateRoleSummary() {
  const playerCount = getPlayerCount();
  const roleTotal = getRoleTotal();
  const diff = playerCount - roleTotal;

  playerCountInput.value = playerCount;
  roleSummary.textContent = `参加人数 ${playerCount}人 / 役職合計 ${roleTotal}人`;

  if (diff === 0) {
    setupError.textContent = "";
  } else if (diff > 0) {
    setupError.textContent = `あと ${diff}人分の役職を追加してください。`;
  } else {
    setupError.textContent = `役職が ${Math.abs(diff)}人分多いです。`;
  }
}

function setRecommendedRoles() {
  const playerCount = getPlayerCount();

  if (playerCount === 0) {
    roleInputs.forEach((input) => {
      input.value = 0;
    });
    updateRoleSummary();
    return;
  }

  const werewolfCount = playerCount >= 10 ? 3 : playerCount >= 6 ? 2 : 1;
  const seerCount = 1;
  const knightCount = playerCount >= 6 ? 1 : 0;
  const mediumCount = playerCount >= 9 ? 1 : 0;
  const madmanCount = playerCount >= 7 ? 1 : 0;
  const villagerCount = playerCount - werewolfCount - seerCount - knightCount - mediumCount - madmanCount;
  const recommended = {
    人狼: werewolfCount,
    占い師: seerCount,
    騎士: knightCount,
    霊媒師: mediumCount,
    狂人: madmanCount,
    市民: Math.max(villagerCount, 0),
  };

  roleInputs.forEach((input) => {
    input.value = recommended[input.dataset.role];
  });
  updateRoleSummary();
}

function makeRoleList() {
  const roles = [];

  roleInputs.forEach((input) => {
    const count = Number(input.value);
    for (let i = 0; i < count; i += 1) {
      roles.push(input.dataset.role);
    }
  });

  return roles;
}

function shuffle(array) {
  const copiedArray = [...array];

  for (let i = copiedArray.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [copiedArray[i], copiedArray[randomIndex]] = [copiedArray[randomIndex], copiedArray[i]];
  }

  return copiedArray;
}

async function assignRoles() {
  const playerCount = getPlayerCount();
  const roleTotal = getRoleTotal();

  if (playerCount < 4) {
    setupError.textContent = "参加人数は4人以上にしてください。";
    return;
  }

  if (playerCount !== roleTotal) {
    updateRoleSummary();
    return;
  }

  assignButton.disabled = true;
  setupError.textContent = "";

  try {
    const playersSnap = await getDocs(getPlayersRef(currentRoomId));
    const players = playersSnap.docs.map((playerDoc) => ({
      id: playerDoc.id,
      ...playerDoc.data(),
    }));
    const roles = shuffle(makeRoleList());
    const batch = writeBatch(db);

    players.forEach((player, index) => {
      batch.update(getPlayerRef(currentRoomId, player.id), {
        role: roles[index],
        updatedAt: serverTimestamp(),
      });
    });
    batch.update(getRoomRef(currentRoomId), {
      status: "assigned",
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    setupError.textContent = "全員の端末に役職を送信しました。";
  } catch (error) {
    setupError.textContent = `送信に失敗しました: ${error.message}`;
  } finally {
    assignButton.disabled = false;
  }
}

function revealRole() {
  if (ownRole === "") {
    playerStatus.textContent = "まだ役職は配られていません。";
    return;
  }

  roleVisible = !roleVisible;
  privateRole.textContent = roleVisible ? ownRole : "配布されました";
  revealRoleButton.textContent = roleVisible ? "役職をふせる" : "役職を見る";
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function updateTimerDisplay() {
  timerDisplay.textContent = formatTime(timerSeconds);
  timerDisplay.classList.toggle("is-finished", timerSeconds === 0);
}

function startTimer() {
  if (timerId !== null || timerSeconds === 0) {
    return;
  }

  timerId = window.setInterval(() => {
    timerSeconds -= 1;
    updateTimerDisplay();

    if (timerSeconds === 0) {
      pauseTimer();
    }
  }, 1000);
}

function pauseTimer() {
  window.clearInterval(timerId);
  timerId = null;
}

function resetTimer() {
  pauseTimer();
  timerSeconds = Number(timerPreset.value);
  updateTimerDisplay();
}

createRoomButton.addEventListener("click", createRoom);
showJoinButton.addEventListener("click", () => joinBox.classList.toggle("is-hidden"));
joinRoomButton.addEventListener("click", joinRoom);
joinRoomCodeInput.addEventListener("input", () => {
  joinRoomCodeInput.value = joinRoomCodeInput.value.toUpperCase();
});
joinNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinRoom();
  }
});

document.querySelectorAll("[data-go-to]").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.goTo));
});

roleInputs.forEach((input) => {
  input.addEventListener("input", updateRoleSummary);
});

autoRolesButton.addEventListener("click", setRecommendedRoles);
assignButton.addEventListener("click", assignRoles);
revealRoleButton.addEventListener("click", revealRole);
timerPreset.addEventListener("change", resetTimer);
timerStartButton.addEventListener("click", startTimer);
timerPauseButton.addEventListener("click", pauseTimer);
timerResetButton.addEventListener("click", resetTimer);

createRoomButton.disabled = true;
joinRoomButton.disabled = true;
updateRoleSummary();
updateTimerDisplay();
startFirebase().catch((error) => {
  setStatus(`Firebase接続エラー: ${error.message}`, true);
});
