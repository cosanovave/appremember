// ─── State ────────────────────────────────────────────────────────────────────
let viewDate = new Date();
let selectedDate = new Date();
let tasks = loadTasks();
let clients = loadClients();
let activeClientFilter = '';
let notifTimeouts = [];
let swRegistration = null;

const CLIENT_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6',
  '#ec4899','#14b8a6','#f97316','#3b82f6','#84cc16'];

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  renderCalendar();
  renderFilterBar();
  renderDaySection();
  bindEvents();
  scheduleNotifications();
});

// ─── Service Worker ───────────────────────────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { swRegistration = await navigator.serviceWorker.register('./sw.js'); }
  catch (e) { console.warn('SW:', e); }
}

// ─── Data helpers ──────────────────────────────────────────────────────────────
function loadTasks() {
  try { return JSON.parse(localStorage.getItem('tasks') || '[]'); } catch { return []; }
}
function saveTasks() { localStorage.setItem('tasks', JSON.stringify(tasks)); }

function loadClients() {
  try { return JSON.parse(localStorage.getItem('clients') || '[]'); } catch { return []; }
}
function saveClients() { localStorage.setItem('clients', JSON.stringify(clients)); }

function getClientById(id) { return clients.find(c => c.id === id); }

function nextClientColor() {
  const used = new Set(clients.map(c => c.color));
  return CLIENT_COLORS.find(c => !used.has(c)) || CLIENT_COLORS[clients.length % CLIENT_COLORS.length];
}

function addClient(name) {
  if (!name.trim()) return null;
  const client = { id: Date.now().toString(), name: name.trim(), color: nextClientColor() };
  clients.push(client);
  saveClients();
  return client;
}

function deleteClient(id) {
  clients = clients.filter(c => c.id !== id);
  tasks = tasks.filter(t => t.clientId !== id);
  if (activeClientFilter === id) activeClientFilter = '';
  saveClients();
  saveTasks();
  renderClientsList();
  renderFilterBar();
  renderCalendar();
  renderDaySection();
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDateLabel(d) {
  const today = dateKey(new Date());
  const tomorrow = dateKey(new Date(Date.now() + 86400000));
  const key = dateKey(d);
  if (key === today) return `Hoy, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
  if (key === tomorrow) return `Mañana, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
  return `${DAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function renderCalendar() {
  document.getElementById('monthTitle').textContent =
    `${MONTHS_ES[viewDate.getMonth()]} ${viewDate.getFullYear()}`;

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 0).getDate();
  const daysInPrev = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0).getDate();
  const todayKey = dateKey(new Date());
  const selKey = dateKey(selectedDate);
  const taskDates = new Set(tasks
    .filter(t => !activeClientFilter || t.clientId === activeClientFilter)
    .map(t => t.date));

  for (let i = 0; i < firstDay; i++) {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, daysInPrev - firstDay + 1 + i);
    grid.appendChild(makeDayCell(d, taskDates, todayKey, selKey, true));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    grid.appendChild(makeDayCell(new Date(viewDate.getFullYear(), viewDate.getMonth(), d), taskDates, todayKey, selKey, false));
  }
  const remaining = 42 - firstDay - daysInMonth;
  for (let i = 1; i <= remaining; i++) {
    grid.appendChild(makeDayCell(new Date(viewDate.getFullYear(), viewDate.getMonth()+1, i), taskDates, todayKey, selKey, true));
  }
}

function makeDayCell(date, taskDates, todayKey, selKey, isOther) {
  const key = dateKey(date);
  const cell = document.createElement('div');
  cell.className = 'cal-day' +
    (isOther ? ' other-month' : '') +
    (key === todayKey ? ' today' : '') +
    (key === selKey ? ' selected' : '') +
    (taskDates.has(key) ? ' has-tasks' : '');
  cell.dataset.date = key;

  const num = document.createElement('span');
  num.className = 'day-num';
  num.textContent = date.getDate();
  cell.appendChild(num);

  const dotRow = document.createElement('div');
  dotRow.className = 'dot-row';
  if (taskDates.has(key)) {
    const count = Math.min(tasks.filter(t => t.date === key &&
      (!activeClientFilter || t.clientId === activeClientFilter)).length, 3);
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dotRow.appendChild(dot);
    }
  }
  cell.appendChild(dotRow);
  cell.addEventListener('click', () => selectDay(date));
  return cell;
}

function selectDay(date) {
  selectedDate = date;
  if (date.getMonth() !== viewDate.getMonth() || date.getFullYear() !== viewDate.getFullYear()) {
    viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
  }
  renderCalendar();
  renderDaySection();
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function renderFilterBar() {
  const bar = document.getElementById('filterBar');
  bar.innerHTML = '';

  const allChip = makeFilterChip('Todos', '', activeClientFilter === '');
  bar.appendChild(allChip);

  clients.forEach(client => {
    const chip = makeFilterChip(client.name, client.id, activeClientFilter === client.id, client.color);
    bar.appendChild(chip);
  });

  const manageBtn = document.createElement('button');
  manageBtn.className = 'filter-chip manage-chip';
  manageBtn.textContent = '＋ Clientes';
  manageBtn.addEventListener('click', openClientsModal);
  bar.appendChild(manageBtn);
}

function makeFilterChip(label, clientId, isActive, color) {
  const chip = document.createElement('button');
  chip.className = 'filter-chip' + (isActive ? ' active' : '');
  if (color && isActive) { chip.style.background = color; chip.style.borderColor = color; chip.style.color = '#fff'; }
  else if (color) { chip.style.borderColor = color; chip.style.color = color; }
  chip.textContent = label;
  chip.addEventListener('click', () => {
    activeClientFilter = clientId;
    renderFilterBar();
    renderCalendar();
    renderDaySection();
  });
  return chip;
}

// ─── Day Section & Tasks ──────────────────────────────────────────────────────
function renderDaySection() {
  document.getElementById('dayLabel').textContent = formatDateLabel(selectedDate);

  let dayTasks = tasks
    .filter(t => t.date === dateKey(selectedDate))
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  if (activeClientFilter) {
    dayTasks = dayTasks.filter(t => t.clientId === activeClientFilter);
  }

  const pending = dayTasks.filter(t => !t.completed).length;
  const badge = document.getElementById('taskBadge');
  badge.textContent = `${pending} pendiente${pending !== 1 ? 's' : ''}`;
  badge.className = 'task-count-badge' + (dayTasks.length ? ' visible' : '');

  const list = document.getElementById('tasksList');
  list.innerHTML = '';

  if (dayTasks.length === 0) {
    list.innerHTML = `
      <div class="empty-state view-fade">
        <span class="empty-icon">📋</span>
        <p>Sin tareas para este día</p>
        <p class="sub">Toca + para agregar una</p>
      </div>`;
    return;
  }

  dayTasks.forEach(task => {
    const client = task.clientId ? getClientById(task.clientId) : null;
    const card = document.createElement('div');
    card.className = `task-card priority-${task.priority}${task.completed ? ' completed' : ''} view-fade`;
    if (client) card.style.borderLeftColor = client.color;

    card.innerHTML = `
      <div class="task-check ${task.completed ? 'checked' : ''}" data-id="${task.id}">${task.completed ? '✓' : ''}</div>
      <div class="task-body">
        ${client ? `<span class="client-chip" style="background:${client.color}18;color:${client.color};border-color:${client.color}40">${escapeHtml(client.name)}</span>` : ''}
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          ${task.time ? `<span class="task-time">🕐 ${formatTime(task.time)}</span>` : ''}
          <span class="task-priority-tag tag-${task.priority}">${
            task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja'
          }</span>
        </div>
        ${task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : ''}
      </div>`;

    card.querySelector('.task-check').addEventListener('click', e => { e.stopPropagation(); toggleTask(task.id); });
    card.addEventListener('click', () => openEditModal(task));
    list.appendChild(card);
  });
}

function toggleTask(id) {
  const t = tasks.find(t => t.id === id);
  if (t) { t.completed = !t.completed; saveTasks(); renderCalendar(); renderDaySection(); }
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Nueva Tarea';
  document.getElementById('taskId').value = '';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDate').value = dateKey(selectedDate);
  document.getElementById('taskTime').value = '';
  document.getElementById('taskNotes').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  document.getElementById('newClientGroup').style.display = 'none';
  setPriority('medium');
  populateClientSelect(activeClientFilter || '');
  openModal('taskModal');
  setTimeout(() => document.getElementById('taskTitle').focus(), 300);
}

function openEditModal(task) {
  document.getElementById('modalTitle').textContent = 'Editar Tarea';
  document.getElementById('taskId').value = task.id;
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDate').value = task.date;
  document.getElementById('taskTime').value = task.time || '';
  document.getElementById('taskNotes').value = task.notes || '';
  document.getElementById('deleteBtn').style.display = 'block';
  document.getElementById('newClientGroup').style.display = 'none';
  setPriority(task.priority || 'medium');
  populateClientSelect(task.clientId || '');
  openModal('taskModal');
}

function populateClientSelect(selectedClientId) {
  const sel = document.getElementById('taskClient');
  sel.innerHTML = '<option value="">Sin cliente (personal)</option>';
  clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    if (c.id === selectedClientId) opt.selected = true;
    sel.appendChild(opt);
  });
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '＋ Nuevo cliente...';
  sel.appendChild(newOpt);
  if (!selectedClientId) sel.value = '';
}

document.getElementById('taskClient').addEventListener('change', function() {
  const newGroup = document.getElementById('newClientGroup');
  newGroup.style.display = this.value === '__new__' ? 'block' : 'none';
  if (this.value === '__new__') {
    setTimeout(() => document.getElementById('newClientName').focus(), 100);
  }
});

document.getElementById('taskForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('taskId').value;
  const priority = document.querySelector('input[name="priority"]:checked')?.value || 'medium';

  let clientId = document.getElementById('taskClient').value;

  if (clientId === '__new__') {
    const name = document.getElementById('newClientName').value.trim();
    if (!name) { document.getElementById('newClientName').focus(); return; }
    const newClient = addClient(name);
    clientId = newClient.id;
    document.getElementById('newClientName').value = '';
  }

  const taskData = {
    title: document.getElementById('taskTitle').value.trim(),
    date: document.getElementById('taskDate').value,
    time: document.getElementById('taskTime').value,
    notes: document.getElementById('taskNotes').value.trim(),
    priority,
    clientId,
    completed: false,
  };
  if (!taskData.title || !taskData.date) return;

  if (id) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) tasks[idx] = { ...tasks[idx], ...taskData };
  } else {
    tasks.push({ id: Date.now().toString(), ...taskData });
  }

  saveTasks();
  renderFilterBar();
  renderCalendar();
  renderDaySection();
  closeModal('taskModal');
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  const id = document.getElementById('taskId').value;
  if (!id) return;
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderFilterBar();
  renderCalendar();
  renderDaySection();
  closeModal('taskModal');
});

function setPriority(value) {
  document.querySelectorAll('.priority-option').forEach(el => {
    el.classList.remove('selected-high','selected-medium','selected-low');
    if (el.dataset.value === value) el.classList.add(`selected-${value}`);
  });
  const radio = document.querySelector(`.priority-option[data-value="${value}"] input`);
  if (radio) radio.checked = true;
}

// ─── Clients Modal ────────────────────────────────────────────────────────────
function openClientsModal() {
  renderClientsList();
  openModal('clientsModal');
}

function renderClientsList() {
  const list = document.getElementById('clientsList');
  list.innerHTML = '';

  if (clients.length === 0) {
    list.innerHTML = '<p class="no-clients-msg">Aún no tienes clientes</p>';
    return;
  }

  clients.forEach(client => {
    const count = tasks.filter(t => t.clientId === client.id).length;
    const item = document.createElement('div');
    item.className = 'client-item';
    item.innerHTML = `
      <span class="client-dot" style="background:${client.color}"></span>
      <span class="client-name">${escapeHtml(client.name)}</span>
      <span class="client-task-count">${count} tarea${count !== 1 ? 's' : ''}</span>
      <button class="client-delete-btn" data-id="${client.id}" title="Eliminar cliente">✕</button>`;
    item.querySelector('.client-delete-btn').addEventListener('click', () => {
      if (confirm(`¿Eliminar cliente "${client.name}"? Se eliminarán también todas sus tareas.`)) {
        deleteClient(client.id);
      }
    });
    list.appendChild(item);
  });
}

document.getElementById('addClientBtn').addEventListener('click', () => {
  const input = document.getElementById('newClientInput');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  addClient(name);
  input.value = '';
  renderClientsList();
  renderFilterBar();
});

document.getElementById('newClientInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addClientBtn').click(); }
});

// ─── Notification Modal ───────────────────────────────────────────────────────
function openNotifModal() {
  updateNotifStatus();
  openModal('notifModal');
}

function updateNotifStatus() {
  const bar = document.getElementById('notifStatusBar');
  const btn = document.getElementById('enableNotifBtn');
  if (!('Notification' in window)) {
    bar.className = 'notif-status-bar denied';
    bar.innerHTML = '<span class="status-dot"></span>No disponible en este navegador';
    btn.disabled = true; return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    bar.className = 'notif-status-bar granted';
    bar.innerHTML = '<span class="status-dot"></span>Notificaciones activadas ✓';
    btn.textContent = 'Activadas'; btn.disabled = true;
  } else if (perm === 'denied') {
    bar.className = 'notif-status-bar denied';
    bar.innerHTML = '<span class="status-dot"></span>Bloqueadas — actívalas en Ajustes';
    btn.disabled = true;
  } else {
    bar.className = 'notif-status-bar default';
    bar.innerHTML = '<span class="status-dot"></span>Notificaciones no activadas';
    btn.textContent = 'Activar notificaciones'; btn.disabled = false;
  }
}

document.getElementById('enableNotifBtn').addEventListener('click', async () => {
  const perm = await Notification.requestPermission();
  updateNotifStatus();
  if (perm === 'granted') { scheduleNotifications(); playChime(); }
});

// ─── Notification Scheduling ──────────────────────────────────────────────────
function scheduleNotifications() {
  notifTimeouts.forEach(clearTimeout);
  notifTimeouts = [];
  const now = new Date();

  const tonight9pm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0);
  if (tonight9pm <= now) tonight9pm.setDate(tonight9pm.getDate() + 1);
  notifTimeouts.push(setTimeout(() => { fireEveningReminder(); scheduleNotifications(); }, tonight9pm - now));

  const next8am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
  if (next8am <= now) next8am.setDate(next8am.getDate() + 1);
  notifTimeouts.push(setTimeout(() => { fireMorningReminder(); scheduleNotifications(); }, next8am - now));
}

function fireEveningReminder() {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const pending = tasks.filter(t => t.date === dateKey(tomorrow) && !t.completed);
  if (!pending.length) return;
  const title = '🌙 Recordatorio — Mañana';
  const body = `${pending.length} tarea${pending.length>1?'s':''} mañana:\n` +
    pending.slice(0,3).map(t => {
      const c = t.clientId ? getClientById(t.clientId) : null;
      return `• ${t.title}${c ? ` [${c.name}]` : ''}${t.time ? ' a las '+formatTime(t.time) : ''}`;
    }).join('\n');
  playChime(); showInAppAlert(title, body); sendSystemNotif(title, body, 'evening');
}

function fireMorningReminder() {
  const pending = tasks.filter(t => t.date === dateKey(new Date()) && !t.completed);
  if (!pending.length) return;
  const title = '☀️ Tareas de hoy';
  const body = `${pending.length} tarea${pending.length>1?'s':''} hoy:\n` +
    pending.slice(0,3).map(t => {
      const c = t.clientId ? getClientById(t.clientId) : null;
      return `• ${t.title}${c ? ` [${c.name}]` : ''}${t.time ? ' a las '+formatTime(t.time) : ''}`;
    }).join('\n');
  playChime(); showInAppAlert(title, body); sendSystemNotif(title, body, 'morning');
}

async function sendSystemNotif(title, body, tag) {
  if (Notification.permission !== 'granted') return;
  if (swRegistration?.active) {
    swRegistration.active.postMessage({ type: 'SHOW_NOTIFICATION', title, body, tag });
  } else {
    new Notification(title, { body, icon: './icon.svg', tag });
  }
}

// ─── In-App Alert ─────────────────────────────────────────────────────────────
let alertTimer = null;
function showInAppAlert(title, body) {
  document.getElementById('alertTitle').textContent = title;
  document.getElementById('alertBody').textContent = body;
  document.getElementById('alertBanner').classList.remove('hidden');
  if (alertTimer) clearTimeout(alertTimer);
  alertTimer = setTimeout(() => document.getElementById('alertBanner').classList.add('hidden'), 8000);
}
document.getElementById('alertClose').addEventListener('click', () =>
  document.getElementById('alertBanner').classList.add('hidden'));

// ─── Sound ────────────────────────────────────────────────────────────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i*0.15);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i*0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.15 + 0.4);
      osc.start(ctx.currentTime + i*0.15); osc.stop(ctx.currentTime + i*0.15 + 0.4);
    });
  } catch (e) {}
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow = ''; }

// ─── Event Bindings ───────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('prevMonth').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth()-1); renderCalendar(); });
  document.getElementById('nextMonth').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth()+1); renderCalendar(); });
  document.getElementById('todayBtn').addEventListener('click', () => { viewDate = new Date(); selectedDate = new Date(); renderCalendar(); renderDaySection(); });
  document.getElementById('addTaskBtn').addEventListener('click', openAddModal);
  document.getElementById('notifBtn').addEventListener('click', openNotifModal);
  document.getElementById('closeTaskModal').addEventListener('click', () => closeModal('taskModal'));
  document.getElementById('closeNotifModal').addEventListener('click', () => closeModal('notifModal'));
  document.getElementById('closeClientsModal').addEventListener('click', () => closeModal('clientsModal'));

  ['taskModal','notifModal','clientsModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => { if (e.target.id === id) closeModal(id); });
  });

  document.querySelectorAll('.priority-option').forEach(el => {
    el.addEventListener('click', () => setPriority(el.dataset.value));
  });
}
