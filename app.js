// ─── State ────────────────────────────────────────────────────────────────────
let viewDate = new Date();         // month displayed in calendar
let selectedDate = new Date();     // day whose tasks are shown
let tasks = loadTasks();
let notifTimeouts = [];
let swRegistration = null;

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  renderCalendar();
  renderDaySection();
  bindEvents();
  scheduleNotifications();
});

// ─── Service Worker ───────────────────────────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    console.warn('SW registration failed:', e);
  }
}

// ─── Data helpers ──────────────────────────────────────────────────────────────
function loadTasks() {
  try { return JSON.parse(localStorage.getItem('tasks') || '[]'); } catch { return []; }
}
function saveTasks() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
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
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function renderCalendar() {
  document.getElementById('monthTitle').textContent =
    `${MONTHS_ES[viewDate.getMonth()]} ${viewDate.getFullYear()}`;

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const daysInPrev = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0).getDate();

  const todayKey = dateKey(new Date());
  const selKey = dateKey(selectedDate);

  // Collect which dates have tasks
  const taskDates = new Set(tasks.map(t => t.date));

  // Prev month overflow
  for (let i = 0; i < firstDay; i++) {
    const day = daysInPrev - firstDay + 1 + i;
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, day);
    grid.appendChild(makeDayCell(day, d, taskDates, todayKey, selKey, true));
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
    grid.appendChild(makeDayCell(d, date, taskDates, todayKey, selKey, false));
  }
  // Next month overflow
  const remaining = 42 - firstDay - daysInMonth;
  for (let i = 1; i <= remaining; i++) {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, i);
    grid.appendChild(makeDayCell(i, date, taskDates, todayKey, selKey, true));
  }
}

function makeDayCell(dayNum, date, taskDates, todayKey, selKey, isOther) {
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
  num.textContent = dayNum;
  cell.appendChild(num);

  const dotRow = document.createElement('div');
  dotRow.className = 'dot-row';
  if (taskDates.has(key)) {
    const dayTasks = tasks.filter(t => t.date === key);
    const dotsCount = Math.min(dayTasks.length, 3);
    for (let i = 0; i < dotsCount; i++) {
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
  // If clicking a day in another month, navigate to that month
  if (date.getMonth() !== viewDate.getMonth() || date.getFullYear() !== viewDate.getFullYear()) {
    viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
  }
  renderCalendar();
  renderDaySection();
  document.getElementById('taskForm').dataset.defaultDate = dateKey(date);
}

// ─── Day Section & Tasks ──────────────────────────────────────────────────────
function renderDaySection() {
  document.getElementById('dayLabel').textContent = formatDateLabel(selectedDate);
  const dayTasks = tasks
    .filter(t => t.date === dateKey(selectedDate))
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  const badge = document.getElementById('taskBadge');
  const pending = dayTasks.filter(t => !t.completed).length;
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
    const card = document.createElement('div');
    card.className = `task-card priority-${task.priority}${task.completed ? ' completed' : ''} view-fade`;
    card.innerHTML = `
      <div class="task-check ${task.completed ? 'checked' : ''}" data-id="${task.id}">
        ${task.completed ? '✓' : ''}
      </div>
      <div class="task-body">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          ${task.time ? `<span class="task-time">🕐 ${formatTime(task.time)}</span>` : ''}
          <span class="task-priority-tag tag-${task.priority}">${
            task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja'
          }</span>
        </div>
        ${task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : ''}
      </div>`;

    card.querySelector('.task-check').addEventListener('click', e => {
      e.stopPropagation();
      toggleTask(task.id);
    });
    card.addEventListener('click', () => openEditModal(task));
    list.appendChild(card);
  });
}

function toggleTask(id) {
  const t = tasks.find(t => t.id === id);
  if (t) { t.completed = !t.completed; saveTasks(); renderCalendar(); renderDaySection(); }
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  setPriority('medium');
  openModal('taskModal');
}

function openEditModal(task) {
  document.getElementById('modalTitle').textContent = 'Editar Tarea';
  document.getElementById('taskId').value = task.id;
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDate').value = task.date;
  document.getElementById('taskTime').value = task.time || '';
  document.getElementById('taskNotes').value = task.notes || '';
  document.getElementById('deleteBtn').style.display = 'block';
  setPriority(task.priority || 'medium');
  openModal('taskModal');
}

function setPriority(value) {
  document.querySelectorAll('.priority-option').forEach(el => {
    el.classList.remove('selected-high', 'selected-medium', 'selected-low');
    if (el.dataset.value === value) el.classList.add(`selected-${value}`);
  });
  document.querySelector(`.priority-option[data-value="${value}"] input`).checked = true;
}

document.getElementById('taskForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('taskId').value;
  const priority = document.querySelector('input[name="priority"]:checked')?.value || 'medium';

  const taskData = {
    title: document.getElementById('taskTitle').value.trim(),
    date: document.getElementById('taskDate').value,
    time: document.getElementById('taskTime').value,
    notes: document.getElementById('taskNotes').value.trim(),
    priority,
    completed: false
  };

  if (!taskData.title || !taskData.date) return;

  if (id) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) tasks[idx] = { ...tasks[idx], ...taskData };
  } else {
    tasks.push({ id: Date.now().toString(), ...taskData });
  }

  saveTasks();
  renderCalendar();
  renderDaySection();
  closeModal('taskModal');
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  const id = document.getElementById('taskId').value;
  if (!id) return;
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderCalendar();
  renderDaySection();
  closeModal('taskModal');
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
    bar.innerHTML = '<span class="status-dot"></span>Notificaciones no disponibles en este navegador';
    btn.disabled = true;
    return;
  }

  const perm = Notification.permission;
  if (perm === 'granted') {
    bar.className = 'notif-status-bar granted';
    bar.innerHTML = '<span class="status-dot"></span>Notificaciones activadas ✓';
    btn.textContent = 'Activadas';
    btn.disabled = true;
  } else if (perm === 'denied') {
    bar.className = 'notif-status-bar denied';
    bar.innerHTML = '<span class="status-dot"></span>Bloqueadas — actívalas en Ajustes del navegador';
    btn.disabled = true;
  } else {
    bar.className = 'notif-status-bar default';
    bar.innerHTML = '<span class="status-dot"></span>Notificaciones no activadas';
    btn.textContent = 'Activar notificaciones';
    btn.disabled = false;
  }
}

document.getElementById('enableNotifBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  updateNotifStatus();
  if (perm === 'granted') {
    scheduleNotifications();
    playChime();
  }
});

// ─── Notification Scheduling ──────────────────────────────────────────────────
function scheduleNotifications() {
  notifTimeouts.forEach(clearTimeout);
  notifTimeouts = [];

  const now = new Date();

  // 9 PM tonight → remind about tomorrow's tasks
  const tonight9pm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0);
  if (tonight9pm <= now) tonight9pm.setDate(tonight9pm.getDate() + 1);
  notifTimeouts.push(setTimeout(() => { fireEveningReminder(); scheduleNotifications(); }, tonight9pm - now));

  // 8 AM → remind about today's tasks
  const next8am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
  if (next8am <= now) next8am.setDate(next8am.getDate() + 1);
  notifTimeouts.push(setTimeout(() => { fireMorningReminder(); scheduleNotifications(); }, next8am - now));
}

function fireEveningReminder() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = dateKey(tomorrow);
  const pending = tasks.filter(t => t.date === key && !t.completed);
  if (pending.length === 0) return;

  const count = pending.length;
  const title = '🌙 Recordatorio — Mañana';
  const body = `Tienes ${count} tarea${count > 1 ? 's' : ''} mañana:\n` +
    pending.slice(0, 3).map(t => `• ${t.title}${t.time ? ' a las ' + formatTime(t.time) : ''}`).join('\n');

  playChime();
  showInAppAlert(title, body);
  sendSystemNotif(title, body, 'evening');
}

function fireMorningReminder() {
  const key = dateKey(new Date());
  const pending = tasks.filter(t => t.date === key && !t.completed);
  if (pending.length === 0) return;

  const count = pending.length;
  const title = '☀️ Tareas de hoy';
  const body = `Tienes ${count} tarea${count > 1 ? 's' : ''} hoy:\n` +
    pending.slice(0, 3).map(t => `• ${t.title}${t.time ? ' a las ' + formatTime(t.time) : ''}`).join('\n');

  playChime();
  showInAppAlert(title, body);
  sendSystemNotif(title, body, 'morning');
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
  const banner = document.getElementById('alertBanner');
  document.getElementById('alertTitle').textContent = title;
  document.getElementById('alertBody').textContent = body;
  banner.classList.remove('hidden');
  if (alertTimer) clearTimeout(alertTimer);
  alertTimer = setTimeout(() => banner.classList.add('hidden'), 8000);
}
document.getElementById('alertClose').addEventListener('click', () => {
  document.getElementById('alertBanner').classList.add('hidden');
});

// ─── Sound ────────────────────────────────────────────────────────────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1100, 1320];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.4);
    });
  } catch (e) { /* audio not available */ }
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Event Bindings ───────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('prevMonth').addEventListener('click', () => {
    viewDate.setMonth(viewDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    viewDate.setMonth(viewDate.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById('todayBtn').addEventListener('click', () => {
    viewDate = new Date();
    selectedDate = new Date();
    renderCalendar();
    renderDaySection();
  });

  document.getElementById('addTaskBtn').addEventListener('click', openAddModal);
  document.getElementById('notifBtn').addEventListener('click', openNotifModal);

  document.getElementById('closeTaskModal').addEventListener('click', () => closeModal('taskModal'));
  document.getElementById('closeNotifModal').addEventListener('click', () => closeModal('notifModal'));

  // Close modal on overlay click
  ['taskModal', 'notifModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.id === id) closeModal(id);
    });
  });

  // Priority selector
  document.querySelectorAll('.priority-option').forEach(el => {
    el.addEventListener('click', () => setPriority(el.dataset.value));
  });
}
