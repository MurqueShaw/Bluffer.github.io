// public/game.js
const socket = io();

let myID = "";
let isHost = false;

// 加入游戏
document.getElementById("joinBtn").addEventListener("click", () => {
  const name = document.getElementById("playerName").value.trim();
  if(name) {
    socket.emit("joinGame", name);
  }
});

// 准备按钮（加入后显示）
document.getElementById("readyBtn").addEventListener("click", () => {
  socket.emit("ready");
});

// 房主点击开始游戏
document.getElementById("startGameBtn").addEventListener("click", () => {
  socket.emit("startGame");
});

// 出牌：指定数字、出牌数量及具体牌（这里简单只发送数字和数量）
document.getElementById("declareBtn").addEventListener("click", () => {
  const declaredNumber = document.getElementById("declaredNumber").value.trim();
  const count = parseInt(document.getElementById("cardCount").value.trim());
  if(declaredNumber && count >= 1 && count <= 3) {
    // 实际情况可扩展：也可选择具体牌数据
    socket.emit("playTurn", { declaredNumber, count, cards: [] });
  }
});

// 质疑
document.getElementById("challengeBtn").addEventListener("click", () => {
  socket.emit("challenge");
});

// 过牌
document.getElementById("passBtn").addEventListener("click", () => {
  socket.emit("pass");
});

// 接收加入成功信息
socket.on("joined", (data) => {
  myID = data.id;
  // 显示准备按钮并隐藏加入界面
  document.getElementById("lobby").style.display = "none";
  document.getElementById("readyBtn").style.display = "inline-block";
  document.getElementById("gameArea").style.display = "block";
});

// 更新玩家列表及房主信息
socket.on("updatePlayers", (data) => {
  document.getElementById("playerList").innerText = "玩家ID: " + data.players.join(", ");
  // 如果自己为房主则显示房主控制面板
  if(data.hostID === myID) {
    isHost = true;
    document.getElementById("hostControls").style.display = "block";
  } else {
    isHost = false;
    document.getElementById("hostControls").style.display = "none";
  }
});

// 游戏开始后信息
socket.on("gameStarted", (data) => {
  document.getElementById("gameInfo").innerText = data.message;
  // 隐藏准备按钮
  document.getElementById("readyBtn").style.display = "none";
});

// 当前轮出牌信息
socket.on("turnInfo", (data) => {
  document.getElementById("gameInfo").innerText = data.message;
});

// 更新手牌（显示为文本，实际可做图形化）
socket.on("updateHand", (hand) => {
  const area = document.getElementById("cardsArea");
  area.innerText = "你的手牌: " + hand.map(card => card.rank + card.suit).join(", ");
});

// 显示质疑结果
socket.on("challengeResult", (data) => {
  document.getElementById("resultArea").innerText = data.result;
});

// 游戏结束（排名公布）
socket.on("gameOver", (data) => {
  document.getElementById("gameInfo").innerText = "游戏结束！排名：" + data.ranking.join(", ");
});
