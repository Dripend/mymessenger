let currentUser = '';
let currentRole = '';
let userCreatedAt = '';
let userAvatar = '';

// === Прокрутка вверх при загрузке ===
window.addEventListener('load', () => {
  window.scrollTo(0, 0);
});

// === Загрузка профиля ===
async function loadProfile() {
  const token = sessionStorage.getItem('token');
  const username = sessionStorage.getItem('username');
  const role = sessionStorage.getItem('role') || 'user';

  if (!token || !username) {
    window.location.href = '/';
    return;
  }

  currentUser = username;
  currentRole = role;

  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(username)}?token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      userCreatedAt = data.created_at;
      userAvatar = data.avatar;
      updateProfileInfo(data);
    } else {
      const usersRes = await fetch(`/api/admin/users?token=${encodeURIComponent(token)}`);
      if (usersRes.ok) {
        const users = await usersRes.json();
        const user = users.find(u => u.username === username);
        if (user) {
          userCreatedAt = user.created_at;
          userAvatar = user.avatar || null;
          updateProfileInfo(user);
        }
      }
    }
  } catch (err) {
    console.error('Ошибка загрузки профиля:', err);
  }

  await loadStats();
}

function updateProfileInfo(user) {
  const roleNames = {
    'creator': '👑 Создатель',
    'deputy': '⭐ Заместитель',
    'admin': '🛡️ Администратор',
    'user': ' Пользователь'
  };

  document.getElementById('profile-username').textContent = user.username;
  document.getElementById('profile-role').textContent = roleNames[user.role] || user.role;
  document.getElementById('profile-created').textContent = user.created_at || 'неизвестно';

  const avatarImg = document.getElementById('profile-avatar');
  const removeBtn = document.getElementById('remove-avatar-btn');

  if (user.avatar) {
    avatarImg.src = user.avatar;
    removeBtn.style.display = 'inline-block';
  } else {
    const initial = user.username.charAt(0).toUpperCase();
    avatarImg.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect fill="%23667eea" width="120" height="120" rx="60"/><text fill="white" font-size="60" font-family="Arial" text-anchor="middle" x="60" y="75">${initial}</text></svg>`;
    removeBtn.style.display = 'none';
  }
  avatarImg.style.display = 'block';
}

async function loadStats() {
  const token = sessionStorage.getItem('token');

  try {
    const statsRes = await fetch(`/api/admin/stats?token=${encodeURIComponent(token)}`);
    if (statsRes.ok) {
      const stats = await statsRes.json();
      document.getElementById('stat-messages').textContent = stats.messages_count || 0;
      document.getElementById('stat-rooms').textContent = stats.rooms_count || 0;
    }
  } catch (err) {
    console.error('Ошибка загрузки статистики:', err);
  }
}

// === Загрузка аватара ===
document.getElementById('avatar-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('❌ Размер файла не должен превышать 5MB');
    return;
  }

  if (!file.type.startsWith('image/')) {
    alert('❌ Разрешены только изображения');
    return;
  }

  const token = sessionStorage.getItem('token');
  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await fetch(`/api/profile/avatar?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      alert('❌ ' + (data.detail || 'Ошибка загрузки'));
      return;
    }

    const avatarImg = document.getElementById('profile-avatar');
    avatarImg.src = data.avatar_url + '?t=' + Date.now();
    document.getElementById('remove-avatar-btn').style.display = 'inline-block';
    alert('✅ Аватар успешно загружен');

  } catch (err) {
    alert('❌ Ошибка соединения');
  }

  e.target.value = '';
};

// === Удаление аватара ===
async function removeAvatar() {
  if (!confirm('Удалить аватар?')) return;

  const token = sessionStorage.getItem('token');

  try {
    const res = await fetch(`/api/profile/avatar?token=${encodeURIComponent(token)}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      alert(' Ошибка удаления');
      return;
    }

    const avatarImg = document.getElementById('profile-avatar');
    const initial = currentUser.charAt(0).toUpperCase();
    avatarImg.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect fill="%23667eea" width="120" height="120" rx="60"/><text fill="white" font-size="60" font-family="Arial" text-anchor="middle" x="60" y="75">${initial}</text></svg>`;
    document.getElementById('remove-avatar-btn').style.display = 'none';
    alert('✅ Аватар удалён');

  } catch (err) {
    alert('❌ Ошибка соединения');
  }
}

// === Смена пароля ===
document.getElementById('change-password-form').onsubmit = async (e) => {
  e.preventDefault();

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const messageEl = document.getElementById('password-message');

  if (newPassword !== confirmPassword) {
    showMessage(messageEl, '❌ Новые пароли не совпадают', 'error');
    return;
  }

  if (newPassword.length < 4) {
    showMessage(messageEl, '❌ Пароль должен быть не короче 4 символов', 'error');
    return;
  }

  try {
    const loginRes = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser,
        password: currentPassword
      })
    });

    if (!loginRes.ok) {
      showMessage(messageEl, '❌ Неверный текущий пароль', 'error');
      return;
    }

    showMessage(messageEl, '✅ Функция смены пароля в разработке', 'success');

  } catch (err) {
    showMessage(messageEl, '❌ Ошибка соединения', 'error');
  }
};

function showMessage(element, text, type) {
  element.textContent = text;
  element.className = `message show ${type}`;
  setTimeout(() => {
    element.classList.remove('show');
  }, 5000);
}

// === Удаление аккаунта ===
async function deleteAccount() {
  if (!confirm('⚠️ Вы уверены, что хотите удалить аккаунт?\n\nЭто действие нельзя отменить.')) {
    return;
  }

  const password = prompt('Для подтверждения введите ваш пароль:');
  if (!password) return;

  try {
    const loginRes = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser,
        password: password
      })
    });

    if (!loginRes.ok) {
      alert('❌ Неверный пароль');
      return;
    }

    alert('✅ Функция удаления аккаунта в разработке');

  } catch (err) {
    alert('❌ Ошибка соединения');
  }
}

// === Инициализация ===
loadProfile();