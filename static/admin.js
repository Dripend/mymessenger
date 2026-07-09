let adminToken = '';
let adminRole = '';


// === Вход ===
document.getElementById('admin-login-form').onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!username || !password) {
    errorEl.textContent = 'Введите логин и пароль';
    return;
  }

  try {
    const res = await fetch(`/api/admin/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.detail || 'Неверный логин или пароль';
      return;
    }
    adminToken = data.token;
    adminRole = data.role;  // Сохраняем роль
    sessionStorage.setItem('adminToken', adminToken);
    sessionStorage.setItem('adminRole', adminRole);
    showAdminPanel();
  } catch (err) {
    errorEl.textContent = 'Ошибка соединения';
  }
};

// === Выход ===
document.getElementById('logout-btn').onclick = () => {
  sessionStorage.removeItem('adminToken');
  adminToken = '';
  location.reload();
};

// === Показать панель ===
async function showAdminPanel() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('admin-screen').classList.remove('hidden');

  // Показываем роль в заголовке
  const roleNames = {
    'creator': '👑 Создатель',
    'deputy': '⭐ Заместитель',
    'admin': '🛡️ Администратор'
  };
  const header = document.querySelector('header h1');
  if (header) {
    header.innerHTML = `👑 Админ-панель <span style="font-size: 14px; color: #7f8c8d;">(${roleNames[adminRole] || adminRole})</span>`;
  }

  await loadAll();

  // Конфигурация ролей только для creator
  if (adminRole === 'creator') {
    await loadRoleConfig();
  }
}

// === Загрузить все данные ===
async function loadAll() {
  await Promise.all([loadStats(), loadUsers(), loadRooms()]);
}

// === Статистика ===
async function loadStats() {
  try {
    const res = await fetch(`/api/admin/stats?token=${encodeURIComponent(adminToken)}`);
    const data = await res.json();
    document.getElementById('users-count').textContent = data.users_count;
    document.getElementById('rooms-count').textContent = data.rooms_count;
    document.getElementById('messages-count').textContent = data.messages_count;
    document.getElementById('private-count').textContent = data.private_messages_count;
  } catch (err) {
    console.error('Ошибка загрузки статистики:', err);
  }
}

// === Пользователи ===
async function loadUsers() {
  try {
    const res = await fetch(`/api/admin/users?token=${encodeURIComponent(adminToken)}`);
    const users = await res.json();
    const list = document.getElementById('users-list');
    list.innerHTML = '';

    users.forEach(u => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="item-info">
          <div class="item-name">
            ${u.is_admin ? '👑' : '👤'} ${escapeHtml(u.username)}
            ${u.is_admin ? '<span class="badge admin">Админ</span>' : ''}
          </div>
          <div class="item-meta">Зарегистрирован: ${u.created_at || 'неизвестно'}</div>
        </div>
        ${u.is_admin ? '' : `<button class="btn-delete" onclick="deleteUser('${escapeHtml(u.username)}')">🗑️</button>`}
      `;
      list.appendChild(div);
    });
  } catch (err) {
    console.error('Ошибка загрузки пользователей:', err);
  }
}

async function deleteUser(username) {
  if (!confirm(`Удалить пользователя @${username}? Все его сообщения также будут удалены.`)) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}?token=${encodeURIComponent(adminToken)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const data = await res.json();
      alert('❌ ' + (data.detail || 'Ошибка'));
      return;
    }
    await loadAll();
  } catch (err) {
    alert('Ошибка соединения');
  }
}

// === Комнаты ===
async function loadUsers() {
  try {
    const res = await fetch(`/api/admin/users?token=${encodeURIComponent(adminToken)}`);
    const users = await res.json();
    const list = document.getElementById('users-list');
    list.innerHTML = '';

    const roleNames = {
      'creator': '👑 Создатель',
      'deputy': '⭐ Заместитель',
      'admin': '🛡️ Администратор',
      'user': '👤 Пользователь'
    };

    const roleColors = {
      'creator': '#f39c12',
      'deputy': '#9b59b6',
      'admin': '#3498db',
      'user': '#95a5a6'
    };

    // Определяем, какие роли может назначать текущий админ
    const roleHierarchy = { 'creator': 4, 'deputy': 3, 'admin': 2, 'user': 1 };
    const adminLevel = roleHierarchy[adminRole] || 0;

    users.forEach(u => {
      const div = document.createElement('div');
      div.className = 'list-item';

      // Проверяем, можно ли изменить роль этого пользователя
      const targetLevel = roleHierarchy[u.role] || 0;
      const canModify = adminLevel > targetLevel;

      // Формируем список доступных ролей для назначения
      let roleOptions = '';
      if (canModify) {
        const availableRoles = Object.entries(roleHierarchy)
          .filter(([role, level]) => level < adminLevel)
          .sort((a, b) => b[1] - a[1]);

        availableRoles.forEach(([role, level]) => {
          roleOptions += `<option value="${role}" ${u.role === role ? 'selected' : ''}>${roleNames[role]}</option>`;
        });
      }

      div.innerHTML = `
        <div class="item-info">
          <div class="item-name">
            ${roleNames[u.role] || '👤 Пользователь'} ${escapeHtml(u.username)}
          </div>
          <div class="item-meta">
            Роль: <span class="role-badge" style="background: ${roleColors[u.role]}">${u.role}</span> ·
            Зарегистрирован: ${u.created_at || 'неизвестно'}
          </div>
        </div>
        ${canModify ? `
          <div class="role-controls">
            <select onchange="changeRole('${escapeHtml(u.username)}', this.value)" class="role-select">
              ${roleOptions}
            </select>
            <button class="btn-delete" onclick="deleteUser('${escapeHtml(u.username)}')">🗑️</button>
          </div>
        ` : `<span class="badge" style="background: ${roleColors[u.role]}">${u.role === 'creator' ? 'Нельзя изменить' : 'Нет прав'}</span>`}
      `;
      list.appendChild(div);
    });
  } catch (err) {
    console.error('Ошибка загрузки пользователей:', err);
  }
}

async function deleteRoom(roomId) {
  if (!confirm('Удалить комнату и все её сообщения?')) return;

  try {
    const res = await fetch(`/api/admin/rooms/${encodeURIComponent(roomId)}?token=${encodeURIComponent(adminToken)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const data = await res.json();
      alert('❌ ' + (data.detail || 'Ошибка'));
      return;
    }
    await loadAll();
  } catch (err) {
    alert('Ошибка соединения');
  }
}

// === Очистка сообщений ===
async function clearMessages(days) {
  const text = days === 0
    ? 'Удалить ВСЕ сообщения? Это действие нельзя отменить!'
    : `Удалить сообщения старше ${days} дней?`;

  if (!confirm(text)) return;

  try {
    const res = await fetch(`/api/admin/clear-messages?token=${encodeURIComponent(adminToken)}&days=${days}`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) {
      alert('❌ ' + (data.detail || 'Ошибка'));
      return;
    }
    alert(`✅ Удалено: ${data.deleted.messages} сообщений в комнатах, ${data.deleted.private} личных`);
    await loadStats();
  } catch (err) {
    alert('Ошибка соединения');
  }
}

// === Утилиты ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// === Конфигурация ролей (только для creator) ===
async function loadRoleConfig() {
  try {
    const res = await fetch(`/api/admin/role-config?token=${encodeURIComponent(adminToken)}`);
    if (!res.ok) return; // Не creator — не показываем

    const data = await res.json();
    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = `
      <h2>️ Конфигурация ролей (USER_ROLES)</h2>
      <div class="role-config-form">
        <input type="text" id="role-username" placeholder="Логин пользователя">
        <select id="role-select">
          <option value="creator"> Создатель</option>
          <option value="deputy">⭐ Заместитель</option>
          <option value="admin">🛡️ Администратор</option>
          <option value="user">👤 Пользователь</option>
        </select>
        <button onclick="updateRoleConfig()" class="btn-primary">Применить</button>
      </div>
      <div id="role-config-list" class="role-config-list"></div>
    `;

    // Вставляем после статистики
    const statsGrid = document.querySelector('.stats-grid');
    statsGrid.parentNode.insertBefore(section, statsGrid.nextSibling);

    // Показываем текущую конфигурацию
    const list = section.querySelector('#role-config-list');
    const roleNames = {
      'creator': ' Создатель',
      'deputy': '⭐ Заместитель',
      'admin': '🛡️ Администратор',
      'user': '👤 Пользователь'
    };

    Object.entries(data.USER_ROLES).forEach(([username, role]) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="item-info">
          <div class="item-name">${roleNames[role]} ${escapeHtml(username)}</div>
        </div>
        <button class="btn-delete" onclick="removeRoleConfig('${escapeHtml(username)}')">🗑️</button>
      `;
      list.appendChild(div);
    });
  } catch (err) {
    console.error('Ошибка загрузки конфигурации ролей:', err);
  }
}

async function updateRoleConfig() {
  const username = document.getElementById('role-username').value.trim();
  const role = document.getElementById('role-select').value;

  if (!username) {
    alert('Введите логин');
    return;
  }

  try {
    const res = await fetch(`/api/admin/role-config?username=${encodeURIComponent(username)}&new_role=${role}&token=${encodeURIComponent(adminToken)}`, {
      method: 'PUT'
    });
    const data = await res.json();
    if (!res.ok) {
      alert('❌ ' + (data.detail || 'Ошибка'));
      return;
    }
    alert(`✅ ${username} теперь ${role}`);
    location.reload();
  } catch (err) {
    alert('Ошибка соединения');
  }
}

async function removeRoleConfig(username) {
  if (!confirm(`Удалить ${username} из USER_ROLES?`)) return;

  try {
    const res = await fetch(`/api/admin/role-config?username=${encodeURIComponent(username)}&new_role=user&token=${encodeURIComponent(adminToken)}`, {
      method: 'PUT'
    });
    if (!res.ok) {
      alert('❌ Ошибка');
      return;
    }
    location.reload();
  } catch (err) {
    alert('Ошибка соединения');
  }
}

// === Авто-вход ===
const savedToken = sessionStorage.getItem('adminToken');
const savedRole = sessionStorage.getItem('adminRole');
if (savedToken) {
  adminToken = savedToken;
  adminRole = savedRole || 'admin';
  showAdminPanel();
}

// === Обновите функцию loadUsers ===
async function loadUsers() {
  try {
    const res = await fetch(`/api/admin/users?token=${encodeURIComponent(adminToken)}`);
    const users = await res.json();
    const list = document.getElementById('users-list');
    list.innerHTML = '';

    const roleNames = {
      'creator': '👑 Создатель',
      'deputy': '⭐ Заместитель',
      'admin': '️ Администратор',
      'user': '👤 Пользователь'
    };

    const roleColors = {
      'creator': '#f39c12',
      'deputy': '#9b59b6',
      'admin': '#3498db',
      'user': '#95a5a6'
    };

    users.forEach(u => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="item-info">
          <div class="item-name">
            ${roleNames[u.role] || '👤 Пользователь'} ${escapeHtml(u.username)}
          </div>
          <div class="item-meta">
            Роль: <span class="role-badge" style="background: ${roleColors[u.role]}">${u.role}</span> ·
            Зарегистрирован: ${u.created_at || 'неизвестно'}
          </div>
        </div>
        ${u.role !== 'creator' ? `
          <div class="role-controls">
            <select onchange="changeRole('${escapeHtml(u.username)}', this.value)" class="role-select">
              <option value="user" ${u.role === 'user' ? 'selected' : ''}>Пользователь</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Администратор</option>
              <option value="deputy" ${u.role === 'deputy' ? 'selected' : ''}>Заместитель</option>
              <option value="creator" ${u.role === 'creator' ? 'selected' : ''}>Создатель</option>
            </select>
            <button class="btn-delete" onclick="deleteUser('${escapeHtml(u.username)}')">🗑️</button>
          </div>
        ` : '<span class="badge admin">Нельзя изменить</span>'}
      `;
      list.appendChild(div);
    });
  } catch (err) {
    console.error('Ошибка загрузки пользователей:', err);
  }
}

// === Добавьте функцию изменения роли ===
async function changeRole(username, newRole) {
  if (!confirm(`Изменить роль @${username} на ${newRole}?`)) {
    await loadUsers(); // Отмена
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/role?new_role=${newRole}&token=${encodeURIComponent(adminToken)}`, {
      method: 'PUT'
    });
    const data = await res.json();
    if (!res.ok) {
      alert('❌ ' + (data.detail || 'Ошибка'));
      await loadUsers();
      return;
    }
    alert(`✅ Роль изменена на ${newRole}`);
    await loadAll();
  } catch (err) {
    alert('Ошибка соединения');
    await loadUsers();
  }
}

async function loadRooms() {
  try {
    const res = await fetch(`/api/admin/rooms?token=${encodeURIComponent(adminToken)}`);
    const rooms = await res.json();
    const list = document.getElementById('rooms-list');
    if (!list) return;

    list.innerHTML = '';
    rooms.forEach(r => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="item-info">
          <div class="item-name">${r.type === 'channel' ? '📢' : '💬'} ${r.name}</div>
          <div class="item-meta">Владелец: ${r.owner} · Сообщений: ${r.messages_count}</div>
        </div>
      `;
      list.appendChild(div);
    });
  } catch (err) {
    console.error('Ошибка загрузки комнат:', err);
  }
}