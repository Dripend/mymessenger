// === Элементы ===
const authScreen = document.getElementById('auth-screen');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.getElementById('sidebar');
const chatScreen = document.getElementById('chat-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const currentUserEl = document.getElementById('current-user');
const logoutBtn = document.getElementById('logout-btn');

const roomList = document.getElementById('room-list');
const userList = document.getElementById('user-list');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const typingEl = document.getElementById('typing-indicator');
const roomNameEl = document.getElementById('room-name');
const roomTypeEl = document.getElementById('room-type');
const createRoomBtn = document.getElementById('create-room-btn');
const createRoomModal = document.getElementById('create-room-modal');
const newRoomNameInput = document.getElementById('new-room-name');
const cancelCreateBtn = document.getElementById('cancel-create');
const confirmCreateBtn = document.getElementById('confirm-create');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const emojiGrid = document.getElementById('emoji-grid');

// === Состояние ===
let myName = '';
let ws;
let currentRoomId = null;
let currentPrivateWith = null;  // 🔥 с кем открыт ЛС-чат
let reconnectTimer = null;
let chatMode = 'none';  // 'room' | 'private' | 'none'

// === Эмодзи ===
const emojiData = {
  smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐'],
  gestures: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪'],
  hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💌','💋'],
  animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐢','🐍','🦎'],
  food: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍞','🥐','🥨','🧀','🥚','🍳','🥞','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🍡','🍧','🍨','🍦','🍰','🎂','🍫','🍿','🍩','🍪'],
  objects: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🏒','🏑','🏏','🎿','🏂','🏋️','🤸','🏄','🏊','🚴','🎖️','🏆','🥇','🥈','🥉','🏅','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🎲','🎯','🎳','🎮']
};
let currentEmojiCat = 'smileys';

// === Авторизация ===
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    loginForm.classList.toggle('hidden', !isLogin);
    registerForm.classList.toggle('hidden', isLogin);
    loginError.textContent = '';
    registerError.textContent = '';
  };
});

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const password2 = document.getElementById('reg-password2').value;
  if (password !== password2) { registerError.textContent = 'Пароли не совпадают'; return; }
  try {
    const res = await fetch('/api/register', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { registerError.textContent = data.detail || 'Ошибка'; return; }
    saveAuth(data.token, data.username);
    enterChat(data.username, data.token);
  } catch (err) { registerError.textContent = 'Ошибка соединения'; }
};

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { loginError.textContent = data.detail || 'Ошибка'; return; }
    saveAuth(data.token, data.username);
    enterChat(data.username, data.token);
  } catch (err) { loginError.textContent = 'Ошибка соединения'; }
};

function saveAuth(token, username) {
  sessionStorage.setItem('token', token);
  sessionStorage.setItem('username', username);
}

function loadAuth() {
  const token = sessionStorage.getItem('token');
  const username = sessionStorage.getItem('username');
  if (token && username) { enterChat(username, token); return true; }
  return false;
}

function enterChat(username, token) {
  myName = username;
  currentUserEl.textContent = `@${username}`;
  authScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  connectWebSocket(token);
}

function logout() {
  sessionStorage.clear();
  if (ws) ws.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  location.reload();
}
logoutBtn.onclick = logout;

// 🔥 === Вкладки sidebar ===
document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isRooms = tab.dataset.tab === 'rooms';
    document.getElementById('rooms-panel').classList.toggle('hidden', !isRooms);
    document.getElementById('users-panel').classList.toggle('hidden', isRooms);
  };
});

// === WebSocket ===
let currentToken = '';

function connectWebSocket(token) {
  currentToken = token;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`);

  ws.onopen = () => console.log('✅ WebSocket подключён');
  ws.onmessage = (event) => handleEvent(JSON.parse(event.data));
  ws.onclose = (event) => {
    if (event.code === 4001) { logout(); return; }
    if (sessionStorage.getItem('token')) {
      reconnectTimer = setTimeout(() => connectWebSocket(currentToken), 2000);
    }
  };
}

// === Обработка событий ===
function handleEvent(data) {
  switch (data.type) {
    case 'room_list': renderRoomList(data.data); break;
    case 'room_created': addRoomToList(data.data); break;
    case 'user_list': renderUserList(data.data); break;
    case 'user_offline': updateUserOnlineStatus(data.data.username, false); break;

    case 'room_joined':
      currentRoomId = data.data.id;
      currentPrivateWith = null;
      chatMode = 'room';
      const isOwner = data.data.is_owner;
      const roomType = data.data.room_type;
      roomNameEl.textContent = data.data.name;
      roomTypeEl.textContent = roomType === 'channel' ? '📢 Канал' : '💬 Комната';
      const canWrite = roomType === 'room' || isOwner;
      messageInput.disabled = !canWrite;
      sendBtn.disabled = !canWrite;
      emojiBtn.disabled = !canWrite;
      messageInput.placeholder = canWrite ? 'Напишите сообщение...' : '🔒 Только чтение';
      messagesEl.innerHTML = '';
      data.data.history.forEach(m => addMessage({ user: m.user, text: m.text, time: m.time }));
      highlightActive('.room-item', currentRoomId);
      highlightActive('.user-item', null);
      break;

    // 🔥 Открыт ЛС-чат
    case 'private_opened':
      currentPrivateWith = data.data.username;
      currentRoomId = null;
      chatMode = 'private';
      roomNameEl.textContent = `@${data.data.username}`;
      roomTypeEl.textContent = data.data.is_online ? '🟢 В сети' : '⚫ Не в сети';
      messageInput.disabled = false;
      sendBtn.disabled = false;
      emojiBtn.disabled = false;
      messageInput.placeholder = 'Личное сообщение...';
      messagesEl.innerHTML = '';
      data.data.history.forEach(m => {
        const isMine = m.from === myName;
        addPrivateMessage({
          user: m.from,
          text: m.text,
          time: m.time,
          incoming: !isMine
        });
      });
      highlightActive('.room-item', null);
      highlightActive('.user-item', currentPrivateWith);
      break;

    // 🔥 Входящее/исходящее ЛС
    case 'private_message':
      const isMine = data.from === myName;
      // Показываем только если открыт чат с этим пользователем
      if (currentPrivateWith === data.from || currentPrivateWith === data.to) {
        addPrivateMessage({
          user: data.from,
          text: data.text,
          time: data.time,
          incoming: !isMine
        });
      } else {
        // Уведомление о новом ЛС
        const other = isMine ? data.to : data.from;
        if (!isMine) {
          showNotification(`💬 Новое сообщение от @${other}`);
        }
      }
      break;

    case 'message':
      if (chatMode === 'room' && data.room_id === currentRoomId) {
        addMessage({ user: data.user, text: data.text, time: data.time });
      }
      break;

    case 'typing':
      if (chatMode === 'room' && data.room_id === currentRoomId && data.user !== myName) {
        typingEl.textContent = `${data.user} печатает...`;
        clearTimeout(typingEl._t);
        typingEl._t = setTimeout(() => typingEl.textContent = '', 2000);
      }
      break;

    case 'error':
      alert('⚠️ ' + data.text);
      break;
  }
}

// === Комнаты ===
function renderRoomList(rooms) {
  roomList.innerHTML = '';
  rooms.forEach(addRoomToList);
}
function addRoomToList(room) {
  if (document.querySelector(`.room-item[data-room-id="${room.id}"]`)) return;
  const div = document.createElement('div');
  div.className = 'room-item';
  div.dataset.roomId = room.id;
  const icon = room.type === 'channel' ? '📢' : '💬';
  div.innerHTML = `
    <div class="room-icon">${icon}</div>
    <div class="room-info">
      <div class="room-name">${escapeHtml(room.name)}</div>
      <div class="room-type-badge">${room.type === 'channel' ? 'Канал' : 'Комната'}</div>
    </div>
  `;
  div.onclick = () => ws.send(JSON.stringify({ type: 'join_room', room_id: room.id }));
  roomList.appendChild(div);
}

// 🔥 === Пользователи ===
function renderUserList(users) {
  userList.innerHTML = '';
  // Сначала онлайн, потом оффлайн
  users.sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0));
  users.forEach(addUserToList);
}
// 🔥 Генератор градиента по имени (детерминированный)
function getAvatarGradient(name) {
  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)',
  ];
  // Хэш от имени
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function addUserToList(user) {
  if (user.username === myName) return;
  if (document.querySelector(`.user-item[data-username="${user.username}"]`)) return;

  const div = document.createElement('div');
  div.className = 'user-item';
  div.dataset.username = user.username;
  const initial = user.username.charAt(0).toUpperCase();
  const gradient = getAvatarGradient(user.username);

  div.innerHTML = `
    <div class="user-avatar" style="background: ${gradient}">
      ${initial}
      <span class="status-dot ${user.is_online ? 'online' : 'offline'}"></span>
    </div>
    <div class="user-info">
      <div class="user-name">@${escapeHtml(user.username)}</div>
      <div class="user-status">${user.is_online ? '🟢 В сети' : '⚫ Не в сети'}</div>
    </div>
  `;
  div.onclick = () => {
    ws.send(JSON.stringify({ type: 'open_private', username: user.username }));
  };
  userList.appendChild(div);
}

function updateUserOnlineStatus(username, isOnline) {
  const item = document.querySelector(`.user-item[data-username="${username}"]`);
  if (item) {
    const dot = item.querySelector('.status-dot');
    const status = item.querySelector('.user-status');
    dot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
    status.textContent = isOnline ? 'В сети' : 'Не в сети';
  }
  // Если открыт чат с этим пользователем — обновим статус
  if (currentPrivateWith === username) {
    roomTypeEl.textContent = isOnline ? '🟢 В сети' : '⚫ Не в сети';
  }
}

function highlightActive(selector, value) {
  document.querySelectorAll(selector).forEach(i => {
    const attr = selector.includes('room') ? 'roomId' : 'username';
    i.classList.toggle('active', i.dataset[attr] === value);
  });
}

// === Сообщения ===
function addMessage({ user, text, time }) {
  const div = document.createElement('div');
  div.className = 'msg' + (user === myName ? ' own' : '');
  div.innerHTML = `
    ${user !== myName ? `<div class="user">${escapeHtml(user)}</div>` : ''}
    <div>${escapeHtml(text)}</div>
    <div class="time">${time}</div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 🔥 Личные сообщения
function addPrivateMessage({ user, text, time, incoming }) {
  const div = document.createElement('div');
  div.className = `msg private ${incoming ? 'incoming' : 'outgoing'}`;
  div.innerHTML = `
    ${incoming ? `<div class="user">${escapeHtml(user)}</div>` : ''}
    <div>${escapeHtml(text)}</div>
    <div class="time">${time}</div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// 🔥 Отправка сообщения — учитываем режим
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || messageInput.disabled) return;

  if (chatMode === 'room' && currentRoomId) {
    ws.send(JSON.stringify({ type: 'message', text }));
  } else if (chatMode === 'private' && currentPrivateWith) {
    ws.send(JSON.stringify({ type: 'private_message', to: currentPrivateWith, text }));
  }
  messageInput.value = '';
}
sendBtn.onclick = sendMessage;
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
messageInput.addEventListener('input', () => {
  if (!messageInput.disabled && chatMode === 'room') {
    ws.send(JSON.stringify({ type: 'typing' }));
  }
});

// === Создание комнаты ===
createRoomBtn.onclick = () => {
  createRoomModal.classList.remove('hidden');
  newRoomNameInput.value = '';
  newRoomNameInput.focus();
};
cancelCreateBtn.onclick = () => createRoomModal.classList.add('hidden');
confirmCreateBtn.onclick = () => {
  const name = newRoomNameInput.value.trim();
  const roomType = document.querySelector('input[name="room-type"]:checked').value;
  if (!name) { alert('Введите название'); return; }
  ws.send(JSON.stringify({ type: 'create_room', name, roomType }));
  createRoomModal.classList.add('hidden');
};
newRoomNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') confirmCreateBtn.click();
});

// === Эмодзи ===
function renderEmojis(cat) {
  emojiGrid.innerHTML = '';
  (emojiData[cat] || []).forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'emoji-item';
    btn.textContent = e;
    btn.onclick = () => { messageInput.value += e; messageInput.focus(); };
    emojiGrid.appendChild(btn);
  });
}
emojiBtn.onclick = (e) => {
  e.stopPropagation();
  if (emojiBtn.disabled) return;
  emojiPicker.classList.toggle('hidden');
  if (!emojiPicker.classList.contains('hidden')) renderEmojis(currentEmojiCat);
};
document.querySelectorAll('.emoji-cat').forEach(btn => {
  btn.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.emoji-cat').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentEmojiCat = btn.dataset.cat;
    renderEmojis(currentEmojiCat);
  };
});
document.addEventListener('click', (e) => {
  if (!emojiPicker.classList.contains('hidden') &&
      !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
    emojiPicker.classList.add('hidden');
  }
});

// 🔥 Простое уведомление
function showNotification(text) {
  // Можно заменить на toast-уведомление
  console.log('🔔', text);
}

// === Старт ===
if (!loadAuth()) {
  authScreen.classList.remove('hidden');
}
