// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 将 public 文件夹作为静态资源目录
app.use(express.static(__dirname + '/public'));

// 全局游戏状态
let players = [];      // 所有玩家对象
let gameStarted = false;
let currentTurnIndex = 0;
let currentDeclaredNumber = null;
let cardsOnTable = null;
let deck = [];
let ranking = [];      // 出完牌的玩家排名

// 分配大写字母ID（依次 A, B, C, …）
const availableIDs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// 生成并洗牌54张牌（包含两张JOKER）
function generateDeck() {
  const suits = ['S', 'H', 'C', 'D'];
  const ranks = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  let newDeck = [];
  suits.forEach(suit => {
    ranks.forEach(rank => {
      newDeck.push({ rank, suit });
    });
  });
  newDeck.push({ rank: 'JOKER', suit: 'W' });
  newDeck.push({ rank: 'JOKER', suit: 'W' });
  newDeck.sort(() => Math.random() - 0.5);
  return newDeck;
}

// 发牌，并让每个玩家手牌按花色排序（排序规则：S>H>C>D, W（JOKER）最大）
function dealCards() {
  deck = generateDeck();
  const numPlayers = players.length;
  // 清空之前手牌
  players.forEach(p => p.hand = []);
  deck.forEach((card, index) => {
    players[index % numPlayers].hand.push(card);
  });
  // 简单排序：先按花色（设定权重 S:4, H:3, C:2, D:1, W:5），再按牌面（2~A，JOKER取15）
  players.forEach(p => {
    p.hand.sort((a, b) => {
      const suitOrder = { S:4, H:3, C:2, D:1, W:5 };
      const rankOrder = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14, 'JOKER':15};
      if(a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
      return rankOrder[a.rank] - rankOrder[b.rank];
    });
  });
}

// 向所有玩家广播玩家列表及房主ID
function updatePlayerList() {
  io.emit("updatePlayers", { players: players.map(p => p.id), hostID: players.length > 0 ? players[0].id : "" });
}

// Socket.IO 事件处理
io.on('connection', socket => {
  console.log("New connection: " + socket.id);

  // 玩家加入房间，分配ID，并保存socket引用
  socket.on("joinGame", (name) => {
    if(gameStarted) {
      socket.emit("message", { message: "游戏已经开始，无法加入！" });
      return;
    }
    let id = availableIDs.shift();
    let player = {
      id: id,
      name: name,
      socket: socket,
      hand: [],
      isHost: players.length === 0, // 第一个加入的为房主
      isReady: false
    };
    players.push(player);
    updatePlayerList();
    socket.emit("joined", { id: id });
  });

  // 玩家准备：房主可启动游戏（此处简单将所有玩家标记为准备）
  socket.on("ready", () => {
    let player = players.find(p => p.socket.id === socket.id);
    if(player) {
      player.isReady = true;
      // 房主操作：当玩家数在2-8之间且房主已准备，则启动游戏
      if(player.isHost && players.length >= 2 && players.length <= 8) {
        gameStarted = true;
        dealCards();
        // 通知每个玩家更新手牌
        players.forEach(p => {
          p.socket.emit("updateHand", p.hand);
        });
        io.emit("gameStarted", { message: "游戏开始！" });
        // 随机指定第一位出牌者
        currentTurnIndex = Math.floor(Math.random() * players.length);
        io.emit("turnInfo", { message: `当前轮到玩家 ${players[currentTurnIndex].id} 出牌。` });
      }
    }
  });

  // 玩家出牌（庄家指定数字并出牌，广播出牌信息）
  socket.on("playTurn", (data) => {
    let player = players[currentTurnIndex];
    if(player.socket.id === socket.id) {
      currentDeclaredNumber = data.declaredNumber;
      // 记录本轮出牌信息：出牌者ID、指定数字、出牌数量（此处简化为玩家主动发送数量）
      cardsOnTable = { playerID: player.id, declaredNumber: currentDeclaredNumber, count: data.count, cards: data.cards };
      io.emit("turnInfo", { message: `玩家 ${player.id} 指定出 ${currentDeclaredNumber}，出牌数量: ${data.count}` });
      // 此处后续逻辑（如验证出牌真伪、处理真假牌、弃掉大小王等）可进一步扩展
    }
  });

  // 玩家质疑
  socket.on("challenge", () => {
    // 简单随机判断真或假（实际应校验出牌内容）
    let result = Math.random() > 0.5 ? "真" : "假";
    io.emit("challengeResult", { result: `质疑结果: ${result}` });
    // 根据结果切换庄家：若真，则出牌者继续做庄；若假，则质疑者成为庄家
    let prevTurn = players[currentTurnIndex];
    if(result === "真") {
      // 出牌者继续做庄
      prevTurn.isHost = true;
    } else {
      // 找到质疑者（这里简化为最后发送质疑的玩家，实际应记录质疑者）
      let challenger = players.find(p => p.socket.id === socket.id);
      if(challenger) {
        challenger.isHost = true;
        // 调整出牌顺序，使质疑者下轮先出牌
        currentTurnIndex = players.indexOf(challenger);
      }
    }
    io.emit("turnInfo", { message: `新庄家是玩家 ${players[currentTurnIndex].id}，开始新一轮。` });
  });

  // 玩家选择过牌：本轮弃牌，下一玩家成为庄家
  socket.on("pass", () => {
    currentTurnIndex = (currentTurnIndex + 1) % players.length;
    io.emit("turnInfo", { message: `玩家 ${players[currentTurnIndex].id} 获得庄家资格，新一轮开始。` });
  });

  // 玩家断线处理
  socket.on("disconnect", () => {
    console.log("Player disconnected: " + socket.id);
    // 回收该玩家ID
    let leaving = players.find(p => p.socket.id === socket.id);
    if(leaving) {
      availableIDs.push(leaving.id);
    }
    players = players.filter(p => p.socket.id !== socket.id);
    updatePlayerList();
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
