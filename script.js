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
  timerPage: document.getElementById("timerPage"),
  missionPage: document.getElementById("missionPage"),
  votePage: document.getElementById("votePage"),
  resultsPage: document.getElementById("resultsPage"),
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
const hostNameInput = document.getElementById("hostNameInput");
const hostJoinButton = document.getElementById("hostJoinButton");
const hostJoinError = document.getElementById("hostJoinError");
const playerList = document.getElementById("playerList");
const playerSummary = document.getElementById("playerSummary");
const playerCountInput = document.getElementById("playerCount");
const roleInputs = Array.from(document.querySelectorAll(".role-input"));
const roleSummary = document.getElementById("roleSummary");
const setupError = document.getElementById("setupError");
const autoRolesButton = document.getElementById("autoRolesButton");
const assignButton = document.getElementById("assignButton");
const goTimerButton = document.getElementById("goTimerButton");
const hostOwnRolePanel = document.getElementById("hostOwnRolePanel");
const hostNameLabel = document.getElementById("hostNameLabel");
const hostPrivateRole = document.getElementById("hostPrivateRole");
const hostRoleStatus = document.getElementById("hostRoleStatus");
const hostRevealRoleButton = document.getElementById("hostRevealRoleButton");
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
const timerFinishButton = document.getElementById("timerFinishButton");
const missionSuccessButton = document.getElementById("missionSuccessButton");
const missionFailureButton = document.getElementById("missionFailureButton");
const missionStatus = document.getElementById("missionStatus");
const missionResultLabel = document.getElementById("missionResultLabel");
const voteOptions = document.getElementById("voteOptions");
const voteStatus = document.getElementById("voteStatus");
const voteResultsPanel = document.getElementById("voteResultsPanel");
const voteSummary = document.getElementById("voteSummary");
const voteResults = document.getElementById("voteResults");
const voteTimerContainer = document.getElementById("voteTimerContainer");
const voteTimerDisplay = document.getElementById("voteTimerDisplay");
const voteTimerLabel = document.getElementById("voteTimerLabel");
const voteCountLabel = document.getElementById("voteCountLabel");
const backToHostButton = document.getElementById("backToHostButton");
const resultsTitle = document.getElementById("resultsTitle");
const resultsMessage = document.getElementById("resultsMessage");
const backToWelcomeButton = document.getElementById("backToWelcomeButton");

let app;
let auth;
let db;
let currentUser = null;
let currentRoomId = "";
let currentRoomData = null;
let currentPlayers = [];
let hostOwnRole = "";
let hostRoleVisible = false;
let ownRole = "";
let roleVisible = false;
let playerUnsubscribe = null;
let ownPlayerUnsubscribe = null;
let hostPlayerUnsubscribe = null;
let roomUnsubscribe = null;
let voteUnsubscribe = null;
let timerSeconds = Number(timerPreset.value);
let timerId = null;
let voteTimerSeconds = 0;
let voteTimerId = null;
let voteCheckInterval = null;

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

function getVoteRef(roomId, uid) {
  return doc(db, "rooms", roomId, "votes", uid);
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
  listenRoom();
  listenPlayers();
  showPage("hostPage");
}

async function savePlayer(roomId, playerName) {
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
}

async function joinHostAsPlayer() {
  const playerName = hostNameInput.value.trim();

  if (!currentUser || currentRoomId === "") {
    hostJoinError.textContent = "部屋の準備中です。少し待ってください。";
    return;
  }

  if (playerName === "") {
    hostJoinError.textContent = "主催者の名前を入力してください。";
    return;
  }

  await savePlayer(currentRoomId, playerName);
  localStorage.setItem("werewolfHostPlayerName", playerName);
  hostJoinError.textContent = "";
  hostOwnRolePanel.classList.remove("is-hidden");
  listenHostOwnRole(playerName);
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
  await savePlayer(roomId, playerName);

  localStorage.setItem("werewolfRoomId", roomId);
  localStorage.setItem("werewolfMode", "player");
  localStorage.setItem("werewolfPlayerName", playerName);
  joinError.textContent = "";
  listenRoom();
  listenOwnRole(playerName);
  showPage("playerPage");
}

function listenRoom() {
  if (roomUnsubscribe) {
    roomUnsubscribe();
  }

  roomUnsubscribe = onSnapshot(getRoomRef(currentRoomId), (snapshot) => {
    if (!snapshot.exists()) {
      return;
    }

    currentRoomData = snapshot.data();
    const mode = localStorage.getItem("werewolfMode");

    if (currentRoomData.status === "voting" && mode === "player") {
      renderVotePage(false);
      showPage("votePage");
    }
  });
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

function listenHostOwnRole(playerName) {
  if (hostPlayerUnsubscribe) {
    hostPlayerUnsubscribe();
  }

  hostNameLabel.textContent = playerName;
  hostPrivateRole.textContent = "配布待ち";
  hostPrivateRole.classList.add("is-waiting");
  hostOwnRole = "";
  hostRoleVisible = false;
  hostRevealRoleButton.textContent = "役職を見る";

  hostPlayerUnsubscribe = onSnapshot(getPlayerRef(currentRoomId, currentUser.uid), (snapshot) => {
    if (!snapshot.exists()) {
      hostRoleStatus.textContent = "主催者の参加データが見つかりません。";
      return;
    }

    const player = snapshot.data();
    hostNameLabel.textContent = player.name;
    hostOwnRole = player.role || "";

    if (hostOwnRole === "") {
      hostPrivateRole.textContent = "配布待ち";
      hostPrivateRole.classList.add("is-waiting");
      hostRoleStatus.textContent = "役職が配られるまで待ってください。";
      hostRoleVisible = false;
      hostRevealRoleButton.textContent = "役職を見る";
      return;
    }

    hostPrivateRole.classList.remove("is-waiting");
    hostPrivateRole.textContent = hostRoleVisible ? hostOwnRole : "配布されました";
    hostRoleStatus.textContent = "主催者本人だけがこの役職を確認します。";
  }, () => {
    hostRoleStatus.textContent = "主催者の役職データの受信に失敗しました。";
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
    if (playerCount >= 2 && (getRoleCount("人狼") < 1 || getRoleCount("市民") < 1)) {
      setupError.textContent = "人狼と市民は必ず1人以上にしてください。";
    } else {
      setupError.textContent = "";
    }
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
  const seerCount = playerCount >= 4 ? 1 : 0;
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

function getRoleCount(roleName) {
  const input = roleInputs.find((roleInput) => roleInput.dataset.role === roleName);
  return input ? Number(input.value) : 0;
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

  if (playerCount < 2) {
    setupError.textContent = "参加人数は2人以上にしてください。";
    return;
  }

  if (getRoleCount("人狼") < 1 || getRoleCount("市民") < 1) {
    setupError.textContent = "人狼と市民は必ず1人以上にしてください。";
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
      missionResult: "",
      voteOptions: players.map((player) => ({
        uid: player.id,
        name: player.name,
      })),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    setupError.textContent = "全員の端末に役職を送信しました。";
    goTimerButton.classList.remove("is-hidden");
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

function revealHostRole() {
  if (hostOwnRole === "") {
    hostRoleStatus.textContent = "まだ役職は配られていません。";
    return;
  }

  hostRoleVisible = !hostRoleVisible;
  hostPrivateRole.textContent = hostRoleVisible ? hostOwnRole : "配布されました";
  hostRevealRoleButton.textContent = hostRoleVisible ? "役職をふせる" : "役職を見る";
}

async function goToTimerPage() {
  if (currentRoomId) {
    await updateDoc(getRoomRef(currentRoomId), {
      status: "timer",
      updatedAt: serverTimestamp(),
    });
  }
  resetTimer();
  showPage("timerPage");
}

async function finishTimer() {
  pauseTimer();

  if (currentRoomId) {
    await updateDoc(getRoomRef(currentRoomId), {
      status: "mission",
      updatedAt: serverTimestamp(),
    });
  }

  showPage("missionPage");
}

async function setMissionResult(result) {
  const resultText = result === "success" ? "成功" : "失敗";
  
  // 成功時は市民勝利画面を表示
  if (result === "success") {
    resultsTitle.textContent = "市民の勝利";
    resultsMessage.textContent = "ゴミ出しミッション成功！";
    showPage("resultsPage");
    return;
  }

  // 失敗時は投票に進む
  missionStatus.textContent = `ゴミ出しミッションは${resultText}です。投票に進みます。`;
  currentRoomData = {
    ...currentRoomData,
    status: "voting",
    missionResult: result,
  };

  await updateDoc(getRoomRef(currentRoomId), {
    status: "voting",
    missionResult: result,
    voteStartTime: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  renderVotePage(true);
  listenVotes();
  showPage("votePage");
}

function renderVotePage(isHost) {
  const missionResult = currentRoomData?.missionResult;
  const missionText = missionResult === "success" ? "成功" : missionResult === "failure" ? "失敗" : "未入力";
  const options = currentRoomData?.voteOptions || [];
  const canVote = localStorage.getItem("werewolfMode") === "player"
    || currentPlayers.some((player) => player.id === currentUser?.uid);

  missionResultLabel.textContent = `ゴミ出しミッション: ${missionText}`;
  voteOptions.innerHTML = "";
  voteStatus.textContent = canVote ? "" : "主催者が投票する場合は、先に主催者も参加者として登録してください。";
  voteResultsPanel.classList.toggle("is-hidden", !isHost);
  backToHostButton.classList.toggle("is-hidden", !isHost);

  // ミッション失敗時は投票タイマーを表示
  if (missionResult === "failure") {
    voteTimerContainer.classList.remove("is-hidden");
    startVoteTimer();
  } else {
    voteTimerContainer.classList.add("is-hidden");
  }

  options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "vote-option";
    button.type = "button";
    button.textContent = option.name;
    button.disabled = !canVote;
    button.addEventListener("click", () => submitVote(option));
    voteOptions.appendChild(button);
  });

  if (options.length === 0) {
    voteStatus.textContent = "投票候補がまだありません。";
  }
}

async function submitVote(target) {
  if (!currentUser || currentRoomId === "") {
    voteStatus.textContent = "投票の準備中です。少し待ってください。";
    return;
  }

  await setDoc(getVoteRef(currentRoomId, currentUser.uid), {
    voterUid: currentUser.uid,
    targetUid: target.uid,
    targetName: target.name,
    updatedAt: serverTimestamp(),
  });

  Array.from(document.querySelectorAll(".vote-option")).forEach((button) => {
    button.classList.toggle("is-selected", button.textContent === target.name);
  });
  voteStatus.textContent = `${target.name} に投票しました。`;
}

function listenVotes() {
  if (voteUnsubscribe) {
    voteUnsubscribe();
  }

  voteUnsubscribe = onSnapshot(collection(db, "rooms", currentRoomId, "votes"), (snapshot) => {
    const counts = {};
    let totalVotes = 0;

    snapshot.docs.forEach((voteDoc) => {
      const vote = voteDoc.data();
      totalVotes += 1;
      counts[vote.targetName] = (counts[vote.targetName] || 0) + 1;
    });

    voteSummary.textContent = `${totalVotes}票`;
    voteResults.innerHTML = "";

    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => {
        const item = document.createElement("li");
        item.className = "player-item";

        const label = document.createElement("span");
        label.className = "player-name";
        label.textContent = name;

        const state = document.createElement("span");
        state.className = "player-state";
        state.textContent = `${count}票`;

        item.append(label, state);
        voteResults.appendChild(item);
      });
  }, () => {
    voteStatus.textContent = "投票結果の受信に失敗しました。";
  });
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

function startVoteTimer() {
  if (voteTimerId !== null) {
    return;
  }

  voteTimerSeconds = 90; // 1分30秒
  updateVoteTimerDisplay();

  voteTimerId = window.setInterval(() => {
    voteTimerSeconds -= 1;
    updateVoteTimerDisplay();

    if (voteTimerSeconds === 0) {
      pauseVoteTimer();
      finishVoting();
    }
  }, 1000);

  // 投票完了チェック間隔を設定
  checkVoteCompletion();
}

function pauseVoteTimer() {
  window.clearInterval(voteTimerId);
  voteTimerId = null;
}

function updateVoteTimerDisplay() {
  voteTimerDisplay.textContent = formatTime(voteTimerSeconds);
}

async function finishVoting() {
  pauseVoteTimer();
  window.clearInterval(voteCheckInterval);
  
  // 投票結果を判定して結果ページに移動
  await judgeVoteResult();
}

function checkVoteCompletion() {
  voteCheckInterval = window.setInterval(async () => {
    const totalPlayers = currentPlayers.length;
    const votesSnapshot = await getDocs(collection(db, "rooms", currentRoomId, "votes"));
    const totalVotes = votesSnapshot.size;

    voteCountLabel.textContent = `投票完了: ${totalVotes}/${totalPlayers}人`;

    // 全員投票完了したら投票を終了
    if (totalVotes >= totalPlayers && totalPlayers > 0) {
      await finishVoting();
    }
  }, 500); // 0.5秒ごとにチェック
}

async function judgeVoteResult() {
  const votesSnapshot = await getDocs(collection(db, "rooms", currentRoomId, "votes"));
  const counts = {};
  const voteData = {};

  votesSnapshot.docs.forEach((voteDoc) => {
    const vote = voteDoc.data();
    counts[vote.targetName] = (counts[vote.targetName] || 0) + 1;
    voteData[vote.targetName] = voteData[vote.targetName] || vote.targetUid;
  });

  // 最多得票者を取得
  let maxVotes = 0;
  const topVotedPlayers = [];

  Object.entries(counts).forEach(([name, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      topVotedPlayers.length = 0;
      topVotedPlayers.push(name);
    } else if (count === maxVotes) {
      topVotedPlayers.push(name);
    }
  });

  // 最多得票者に人狼が含まれているか判定
  const topVotedPlayerUids = topVotedPlayers.map((name) => voteData[name]);
  const hasWerewolf = topVotedPlayerUids.some((uid) => {
    const player = currentPlayers.find((p) => p.id === uid);
    return player && player.role === "人狼";
  });

  // 結果表示
  resultsTitle.textContent = hasWerewolf ? "市民の勝利" : "人狼の勝利";
  resultsMessage.textContent = `${topVotedPlayers.join("、")}が投票されました。`;
  showPage("resultsPage");
}

createRoomButton.addEventListener("click", createRoom);
hostJoinButton.addEventListener("click", joinHostAsPlayer);
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
hostNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinHostAsPlayer();
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
goTimerButton.addEventListener("click", goToTimerPage);
hostRevealRoleButton.addEventListener("click", revealHostRole);
revealRoleButton.addEventListener("click", revealRole);
timerPreset.addEventListener("change", resetTimer);
timerStartButton.addEventListener("click", startTimer);
timerPauseButton.addEventListener("click", pauseTimer);
timerResetButton.addEventListener("click", resetTimer);
timerFinishButton.addEventListener("click", finishTimer);
missionSuccessButton.addEventListener("click", () => setMissionResult("success"));
missionFailureButton.addEventListener("click", () => setMissionResult("failure"));
backToHostButton.addEventListener("click", () => showPage("hostPage"));
backToWelcomeButton.addEventListener("click", () => showPage("welcomePage"));

createRoomButton.disabled = true;
joinRoomButton.disabled = true;
updateRoleSummary();
updateTimerDisplay();
startFirebase().catch((error) => {
  setStatus(`Firebase接続エラー: ${error.message}`, true);
});
