// ================================================================
// สมุดงานนักเรียน — Study Planner
// ================================================================

const supabaseClient = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

const DAY_NAMES = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
const DAY_SHORT = ["อา","จ","อ","พ","พฤ","ศ","ส"];
const MONTH_NAMES = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

let currentUser = null;
let assignments = [];
let classSchedule = [];
let personalSchedule = [];
let exams = [];
let calendarEvents = []; // custom notes/events/reminders/busy/free, multiple per day
let calViewYear, calViewMonth; // 0-indexed month
let selectedDayStr = null;
let editingDayEventId = null;

const CATEGORY_LABEL = { event:'กิจกรรม', note:'โน้ต', reminder:'เตือนความจำ', busy:'ยุ่ง', free:'ว่าง' };
const CATEGORY_ICON  = { event:'🔵', note:'🟡', reminder:'🟠', busy:'🟦', free:'🟩' };

// ---------------- helpers ----------------
function $(id){ return document.getElementById(id); }
function pad2(n){ return String(n).padStart(2,'0'); }
function dateStr(y,m,d){ return `${y}-${pad2(m+1)}-${pad2(d)}`; }
function todayStr(){ const t=new Date(); return dateStr(t.getFullYear(), t.getMonth(), t.getDate()); }
function timeShort(t){ return t ? t.slice(0,5) : ""; }

function showToast(msg){
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> el.classList.add('hidden'), 2600);
}

// ---------------- AUTH ----------------
function switchAuthTab(tab){
  document.querySelectorAll('.auth-tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  $('login-form').classList.toggle('hidden', tab!=='login');
  $('signup-form').classList.toggle('hidden', tab!=='signup');
}
document.querySelectorAll('.auth-tab').forEach(b=>{
  b.addEventListener('click', ()=> switchAuthTab(b.dataset.tab));
});

$('signup-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = $('signup-msg'); msg.textContent = "";
  const name = $('signup-name').value.trim();
  const email = $('signup-email').value.trim();
  const password = $('signup-password').value;
  const { data, error } = await supabaseClient.auth.signUp({
    email, password, options:{ data:{ display_name: name } }
  });
  if (error){ msg.textContent = error.message; return; }
  if (data.session){
    await onLoggedIn(data.session.user);
  } else {
    msg.style.color = '#1F9E8E';
    msg.textContent = "สมัครสำเร็จ! กรุณายืนยันอีเมล (ถ้าระบบกำหนดไว้) แล้วเข้าสู่ระบบได้เลย";
    switchAuthTab('login');
  }
});

$('login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = $('login-msg'); msg.textContent = "";
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error){ msg.textContent = "อีเมลหรือรหัสผ่านไม่ถูกต้อง"; return; }
  await onLoggedIn(data.user);
});

$('logout-btn').addEventListener('click', async ()=>{
  await supabaseClient.auth.signOut();
  currentUser = null;
  $('app-screen').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
});

async function onLoggedIn(user){
  currentUser = user;
  const name = user.user_metadata?.display_name || user.email.split('@')[0];
  $('user-name').textContent = name;
  $('auth-screen').classList.add('hidden');
  $('app-screen').classList.remove('hidden');
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth();
  $('today-date').textContent = `${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()+543}`;
  await loadAllData();
  renderEverything();
  startClock();
}

// check existing session on load
(async function initSession(){
  const { data } = await supabaseClient.auth.getSession();
  if (data.session){ await onLoggedIn(data.session.user); }
})();

// ---------------- DATA LOADING ----------------
async function loadAllData(){
  const uid = currentUser.id;
  const [aRes, cRes, pRes, eRes, evRes] = await Promise.all([
    supabaseClient.from('assignments').select('*').eq('user_id', uid).order('created_at', {ascending:true}),
    supabaseClient.from('class_schedule').select('*').eq('user_id', uid).order('start_time', {ascending:true}),
    supabaseClient.from('personal_schedule').select('*').eq('user_id', uid).order('start_time', {ascending:true}),
    supabaseClient.from('exams').select('*').eq('user_id', uid).order('exam_date', {ascending:true}),
    supabaseClient.from('calendar_events').select('*').eq('user_id', uid).order('event_time', {ascending:true})
  ]);
  assignments = aRes.data || [];
  classSchedule = cRes.data || [];
  personalSchedule = pRes.data || [];
  exams = eRes.data || [];
  calendarEvents = evRes.data || [];
  if (aRes.error) console.error(aRes.error);
  if (eRes.error) console.error(eRes.error);
  if (evRes.error) console.error(evRes.error);
}

function renderEverything(){
  renderBoard();
  renderExams();
  renderTimetable('timetable', classSchedule, false);
  renderTimetable('personal-table', personalSchedule, true);
  renderCalendar();
  updateNowClass();
}

// ---------------- TABS ----------------
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    tab.classList.add('active');
    $('view-' + tab.dataset.view).classList.add('active');
  });
});

// ================================================================
// KANBAN BOARD
// ================================================================
function renderBoard(){
  const cols = { todo: $('cards-todo'), done: $('cards-done'), submitted: $('cards-submitted') };
  Object.values(cols).forEach(c => c.innerHTML = "");
  const counts = { todo:0, done:0, submitted:0 };

  assignments.forEach(a=>{
    counts[a.status] = (counts[a.status]||0) + 1;
    const card = document.createElement('div');
    card.className = `card status-${a.status}`;
    card.draggable = true;
    card.dataset.id = a.id;

    let dueHtml = "";
    if (a.due_date){
      const overdue = a.due_date < todayStr() && a.status !== 'submitted';
      dueHtml = `<div class="card-due ${overdue?'overdue':''}">📅 กำหนดส่ง: ${a.due_date}${overdue?' (เลยกำหนด!)':''}</div>`;
    }

    card.innerHTML = `
      <div class="card-subject">${escapeHtml(a.subject)}</div>
      <div class="card-title">${escapeHtml(a.title)}</div>
      ${dueHtml}
      <div class="progress-bar"><div class="progress-fill" style="width:${a.progress}%"></div></div>
      <div class="progress-label">${a.progress}%</div>
    `;
    card.addEventListener('click', ()=> openAssignmentModal(a));
    card.addEventListener('dragstart', ()=>{ card.classList.add('dragging'); dragCardId = a.id; });
    card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
    cols[a.status].appendChild(card);
  });

  $('count-todo').textContent = counts.todo || 0;
  $('count-done').textContent = counts.done || 0;
  $('count-submitted').textContent = counts.submitted || 0;
}

let dragCardId = null;
document.querySelectorAll('.cards').forEach(col=>{
  col.addEventListener('dragover', (e)=>{ e.preventDefault(); col.classList.add('drag-over'); });
  col.addEventListener('dragleave', ()=> col.classList.remove('drag-over'));
  col.addEventListener('drop', async (e)=>{
    e.preventDefault();
    col.classList.remove('drag-over');
    const newStatus = col.dataset.status;
    const a = assignments.find(x=>x.id === dragCardId);
    if (!a || a.status === newStatus) return;
    a.status = newStatus;
    if (newStatus === 'submitted') a.progress = 100;
    renderBoard();
    const { error } = await supabaseClient.from('assignments')
      .update({ status:newStatus, progress:a.progress, updated_at: new Date().toISOString() })
      .eq('id', a.id);
    if (error) showToast("บันทึกสถานะไม่สำเร็จ ลองใหม่อีกครั้ง");
    else showToast(`ย้าย "${a.title}" ไปยัง ${statusLabel(newStatus)} แล้ว`);
  });
});
function statusLabel(s){ return {todo:'ยังไม่เสร็จ', done:'เสร็จแล้ว รอส่ง', submitted:'ส่งแล้ว'}[s]; }

// ---------------- assignment modal ----------------
$('add-assignment-btn').addEventListener('click', ()=> openAssignmentModal(null));
$('cancel-assignment-btn').addEventListener('click', ()=> $('assignment-modal').classList.add('hidden'));
$('assignment-progress').addEventListener('input', (e)=> $('progress-value').textContent = e.target.value + '%');

function openAssignmentModal(a){
  $('assignment-form').reset();
  $('assignment-modal-title').textContent = a ? "แก้ไขงาน" : "เพิ่มงานใหม่";
  $('delete-assignment-btn').classList.toggle('hidden', !a);
  $('assignment-id').value = a ? a.id : "";
  $('assignment-subject').value = a ? a.subject : "";
  $('assignment-title').value = a ? a.title : "";
  $('assignment-due').value = a ? (a.due_date || "") : "";
  $('assignment-details').value = a ? (a.details || "") : "";
  $('assignment-status').value = a ? a.status : "todo";
  $('assignment-progress').value = a ? a.progress : 0;
  $('progress-value').textContent = (a ? a.progress : 0) + '%';
  $('assignment-modal').classList.remove('hidden');
}

$('assignment-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = $('assignment-id').value;
  const payload = {
    user_id: currentUser.id,
    subject: $('assignment-subject').value.trim(),
    title: $('assignment-title').value.trim(),
    due_date: $('assignment-due').value || null,
    details: $('assignment-details').value.trim(),
    status: $('assignment-status').value,
    progress: parseInt($('assignment-progress').value, 10),
    updated_at: new Date().toISOString()
  };
  if (id){
    const { error } = await supabaseClient.from('assignments').update(payload).eq('id', id);
    if (error){ showToast("บันทึกไม่สำเร็จ"); return; }
    const idx = assignments.findIndex(x=>x.id===id);
    assignments[idx] = { ...assignments[idx], ...payload };
  } else {
    const { data, error } = await supabaseClient.from('assignments').insert(payload).select().single();
    if (error){ showToast("เพิ่มงานไม่สำเร็จ"); return; }
    assignments.push(data);
  }
  $('assignment-modal').classList.add('hidden');
  renderBoard();
  renderCalendar();
  showToast("บันทึกงานเรียบร้อย ✓");
});

$('delete-assignment-btn').addEventListener('click', async ()=>{
  const id = $('assignment-id').value;
  if (!confirm("ต้องการลบงานนี้ใช่ไหม?")) return;
  const { error } = await supabaseClient.from('assignments').delete().eq('id', id);
  if (error){ showToast("ลบไม่สำเร็จ"); return; }
  assignments = assignments.filter(x=>x.id!==id);
  $('assignment-modal').classList.add('hidden');
  renderBoard();
  renderCalendar();
  showToast("ลบงานแล้ว");
});

// ================================================================
// ตารางเรียน / ตารางส่วนตัว
// ================================================================
function renderTimetable(containerId, data, isPersonal){
  const container = $(containerId);
  container.innerHTML = "";
  const order = [1,2,3,4,5,6,0]; // จันทร์ -> อาทิตย์
  order.forEach(dow=>{
    const items = data.filter(x=>x.day_of_week === dow).sort((a,b)=> (a.start_time||"").localeCompare(b.start_time||""));
    const row = document.createElement('div');
    row.className = 'day-row';
    let inner = `<div class="day-row-label">${DAY_NAMES[dow]}</div>`;
    if (items.length === 0){
      inner += `<div class="empty-note">ยังไม่มีรายการ</div>`;
    } else {
      items.forEach(it=>{
        const title = isPersonal ? it.title : it.subject;
        const extra = isPersonal ? "" : (it.room ? ` · ${escapeHtml(it.room)}` : "");
        inner += `
          <div class="class-item ${isPersonal?'personal':''}">
            <span>${isPersonal?'🎯':'📘'} ${escapeHtml(title)}${extra}</span>
            <span class="class-item-time">${timeShort(it.start_time)}–${timeShort(it.end_time)}
              <button class="class-item-del" data-id="${it.id}" data-table="${isPersonal?'personal_schedule':'class_schedule'}">✕</button>
            </span>
          </div>`;
      });
    }
    row.innerHTML = inner;
    container.appendChild(row);
  });
  container.querySelectorAll('.class-item-del').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id, table = btn.dataset.table;
      const { error } = await supabaseClient.from(table).delete().eq('id', id);
      if (error){ showToast("ลบไม่สำเร็จ"); return; }
      if (table==='class_schedule') classSchedule = classSchedule.filter(x=>x.id!==id);
      else personalSchedule = personalSchedule.filter(x=>x.id!==id);
      renderTimetable(containerId, table==='class_schedule'?classSchedule:personalSchedule, isPersonal);
      updateNowClass();
    });
  });
}

$('add-class-btn').addEventListener('click', ()=> $('class-modal').classList.remove('hidden'));
$('cancel-class-btn').addEventListener('click', ()=> $('class-modal').classList.add('hidden'));
$('class-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload = {
    user_id: currentUser.id,
    day_of_week: parseInt($('class-day').value, 10),
    subject: $('class-subject').value.trim(),
    room: $('class-room').value.trim(),
    start_time: $('class-start').value,
    end_time: $('class-end').value
  };
  const { data, error } = await supabaseClient.from('class_schedule').insert(payload).select().single();
  if (error){ showToast("เพิ่มวิชาไม่สำเร็จ"); return; }
  classSchedule.push(data);
  $('class-form').reset();
  $('class-modal').classList.add('hidden');
  renderTimetable('timetable', classSchedule, false);
  updateNowClass();
  showToast("เพิ่มวิชาเรียบร้อย ✓");
});

$('add-personal-btn').addEventListener('click', ()=> $('personal-modal').classList.remove('hidden'));
$('cancel-personal-btn').addEventListener('click', ()=> $('personal-modal').classList.add('hidden'));
$('personal-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload = {
    user_id: currentUser.id,
    day_of_week: parseInt($('personal-day').value, 10),
    title: $('personal-title').value.trim(),
    start_time: $('personal-start').value,
    end_time: $('personal-end').value
  };
  const { data, error } = await supabaseClient.from('personal_schedule').insert(payload).select().single();
  if (error){ showToast("เพิ่มกิจกรรมไม่สำเร็จ"); return; }
  personalSchedule.push(data);
  $('personal-form').reset();
  $('personal-modal').classList.add('hidden');
  renderTimetable('personal-table', personalSchedule, true);
  showToast("เพิ่มกิจกรรมเรียบร้อย ✓");
});

// ---------------- current class widget ----------------
function updateNowClass(){
  const now = new Date();
  const dow = now.getDay();
  const nowStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:00`;
  const todays = classSchedule.filter(c=>c.day_of_week===dow).sort((a,b)=>a.start_time.localeCompare(b.start_time));
  const current = todays.find(c=> c.start_time <= nowStr && nowStr < c.end_time);
  const el = $('now-class');
  if (current){
    const [h,m] = current.end_time.split(':').map(Number);
    const endMin = h*60+m;
    const nowMin = now.getHours()*60+now.getMinutes();
    const remain = Math.max(endMin - nowMin, 0);
    el.textContent = `🟢 กำลังเรียน: ${current.subject}${current.room?' ('+current.room+')':''} · เหลืออีก ${remain} นาที`;
    return;
  }
  const next = todays.find(c=> c.start_time > nowStr);
  if (next){
    el.textContent = `⏭ คาบต่อไป: ${next.subject} เวลา ${timeShort(next.start_time)} น.`;
  } else {
    el.textContent = `✅ วันนี้ไม่มีคาบเรียนแล้ว`;
  }
}
function startClock(){
  updateNowClass();
  setInterval(updateNowClass, 30000);
}

// ================================================================
// สอบ / ควิซ
// ================================================================
function daysUntil(dateStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  const target = new Date(y, m-1, d);
  const today = new Date(); today.setHours(0,0,0,0);
  target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

function renderExams(){
  const list = $('exam-list');
  list.innerHTML = "";
  if (exams.length === 0){
    list.innerHTML = `<div class="empty-note">ยังไม่มีการสอบที่บันทึกไว้ กด "+ เพิ่มการสอบ" เพื่อเริ่มต้น</div>`;
    return;
  }
  const sorted = [...exams].sort((a,b)=> a.exam_date.localeCompare(b.exam_date));
  sorted.forEach(ex=>{
    const diff = daysUntil(ex.exam_date);
    let countdownText, countdownClass = "";
    if (diff < 0){ countdownText = "สอบไปแล้ว"; countdownClass = "past"; }
    else if (diff === 0){ countdownText = "สอบวันนี้!"; countdownClass = "today"; }
    else if (diff === 1){ countdownText = "พรุ่งนี้!"; countdownClass = "today"; }
    else { countdownText = `อีก ${diff} วัน`; }

    const card = document.createElement('div');
    card.className = 'exam-card' + (diff >= 0 && diff <= 2 ? ' soon' : '');
    card.innerHTML = `
      <div class="exam-main">
        <div class="exam-subject">${escapeHtml(ex.subject)}</div>
        <div class="exam-title">${escapeHtml(ex.exam_title)}</div>
        <div class="exam-meta">📅 ${ex.exam_date}${ex.exam_time ? ' · ' + timeShort(ex.exam_time) + ' น.' : ''}${ex.location ? ' · 📍 ' + escapeHtml(ex.location) : ''}</div>
        ${ex.topics ? `<div class="exam-topics">📖 ${escapeHtml(ex.topics)}</div>` : ''}
      </div>
      <div class="exam-countdown ${countdownClass}">${countdownText}</div>
    `;
    card.addEventListener('click', ()=> openExamModal(ex));
    list.appendChild(card);
  });
}

$('add-exam-btn').addEventListener('click', ()=> openExamModal(null));
$('cancel-exam-btn').addEventListener('click', ()=> $('exam-modal').classList.add('hidden'));

function openExamModal(ex){
  $('exam-form').reset();
  $('exam-modal-title').textContent = ex ? "แก้ไขการสอบ" : "เพิ่มการสอบ";
  $('delete-exam-btn').classList.toggle('hidden', !ex);
  $('exam-id').value = ex ? ex.id : "";
  $('exam-subject').value = ex ? ex.subject : "";
  $('exam-title').value = ex ? ex.exam_title : "";
  $('exam-date').value = ex ? ex.exam_date : "";
  $('exam-time').value = ex ? (ex.exam_time || "") : "";
  $('exam-location').value = ex ? (ex.location || "") : "";
  $('exam-topics').value = ex ? (ex.topics || "") : "";
  $('exam-modal').classList.remove('hidden');
}

$('exam-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = $('exam-id').value;
  const payload = {
    user_id: currentUser.id,
    subject: $('exam-subject').value.trim(),
    exam_title: $('exam-title').value.trim(),
    exam_date: $('exam-date').value,
    exam_time: $('exam-time').value || null,
    location: $('exam-location').value.trim(),
    topics: $('exam-topics').value.trim(),
    updated_at: new Date().toISOString()
  };
  if (id){
    const { error } = await supabaseClient.from('exams').update(payload).eq('id', id);
    if (error){ showToast("บันทึกไม่สำเร็จ"); return; }
    const idx = exams.findIndex(x=>x.id===id);
    exams[idx] = { ...exams[idx], ...payload };
  } else {
    const { data, error } = await supabaseClient.from('exams').insert(payload).select().single();
    if (error){ showToast("เพิ่มการสอบไม่สำเร็จ"); return; }
    exams.push(data);
  }
  $('exam-modal').classList.add('hidden');
  renderExams();
  renderCalendar();
  showToast("บันทึกการสอบเรียบร้อย ✓");
});

$('delete-exam-btn').addEventListener('click', async ()=>{
  const id = $('exam-id').value;
  if (!confirm("ต้องการลบการสอบนี้ใช่ไหม?")) return;
  const { error } = await supabaseClient.from('exams').delete().eq('id', id);
  if (error){ showToast("ลบไม่สำเร็จ"); return; }
  exams = exams.filter(x=>x.id!==id);
  $('exam-modal').classList.add('hidden');
  renderExams();
  renderCalendar();
  showToast("ลบการสอบแล้ว");
});

// ================================================================
// ปฏิทิน
// ================================================================
function renderCalendar(){
  $('cal-title').textContent = `${MONTH_NAMES[calViewMonth]} ${calViewYear+543}`;
  const grid = $('calendar-grid');
  grid.innerHTML = "";
  DAY_SHORT.forEach(d=>{
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth = new Date(calViewYear, calViewMonth+1, 0).getDate();
  const dueDates = new Set(assignments.filter(a=>a.due_date).map(a=>a.due_date));
  const examDates = new Set(exams.filter(x=>x.exam_date).map(x=>x.exam_date));

  for (let i=0;i<firstDay;i++){
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }
  for (let d=1; d<=daysInMonth; d++){
    const ds = dateStr(calViewYear, calViewMonth, d);
    const el = document.createElement('div');
    let cls = 'cal-day';
    if (ds === todayStr()) cls += ' today';
    el.className = cls;

    let dots = "";
    if (dueDates.has(ds)) dots += `<span class="dot-assignment"></span>`;
    if (examDates.has(ds)) dots += `<span class="dot-exam"></span>`;
    calendarEvents.filter(ev=>ev.event_date===ds).forEach(ev=>{
      dots += `<span class="dot-${ev.category}"></span>`;
    });

    el.innerHTML = `${d}<div class="cal-dots">${dots}</div>`;
    el.addEventListener('click', ()=> openDayModal(ds));
    grid.appendChild(el);
  }
}

$('cal-prev').addEventListener('click', ()=>{
  calViewMonth--; if (calViewMonth<0){ calViewMonth=11; calViewYear--; }
  renderCalendar();
});
$('cal-next').addEventListener('click', ()=>{
  calViewMonth++; if (calViewMonth>11){ calViewMonth=0; calViewYear++; }
  renderCalendar();
});

function openDayModal(ds){
  selectedDayStr = ds;
  editingDayEventId = null;
  resetDayEventForm();
  const [y,m,d] = ds.split('-').map(Number);
  $('day-modal-title').textContent = `${d} ${MONTH_NAMES[m-1]} ${y+543}`;

  const dayAssignments = assignments.filter(a=>a.due_date === ds);
  const dayExams = exams.filter(x=>x.exam_date === ds);
  const fixedBox = $('day-modal-fixed-items');
  let fixedHtml = "";
  dayExams.forEach(ex=>{
    fixedHtml += `<div class="day-exam-item">📕 [${escapeHtml(ex.subject)}] ${escapeHtml(ex.exam_title)}${ex.exam_time?' · '+timeShort(ex.exam_time)+' น.':''}</div>`;
  });
  dayAssignments.forEach(a=>{
    fixedHtml += `<div class="day-assignment-item">📌 [${escapeHtml(a.subject)}] ${escapeHtml(a.title)} — ${statusLabel(a.status)}</div>`;
  });
  fixedBox.innerHTML = fixedHtml || `<div class="empty-note">ไม่มีงานหรือสอบครบกำหนดวันนี้</div>`;

  renderDayEvents();
  $('day-modal').classList.remove('hidden');
}

function renderDayEvents(){
  const items = calendarEvents.filter(ev=>ev.event_date === selectedDayStr)
    .sort((a,b)=> (a.event_time||"").localeCompare(b.event_time||""));
  const box = $('day-modal-events');
  box.innerHTML = items.length ? "" : `<div class="empty-note">ยังไม่มีรายการที่เพิ่มเอง</div>`;
  items.forEach(ev=>{
    const row = document.createElement('div');
    row.className = 'day-event-item';
    row.innerHTML = `
      <div>
        <span class="cat-dot dot-${ev.category}"></span>
        <strong>${escapeHtml(ev.title)}</strong>
        ${ev.event_time ? ' · ' + timeShort(ev.event_time) + ' น.' : ''}
        <div style="color:var(--ink-soft); font-size:12px; margin-top:2px;">${CATEGORY_ICON[ev.category]} ${CATEGORY_LABEL[ev.category]}${ev.note ? ' — ' + escapeHtml(ev.note) : ''}</div>
      </div>
      <div class="day-event-actions">
        <button data-action="edit" title="แก้ไข">✎</button>
        <button data-action="del" title="ลบ">✕</button>
      </div>`;
    row.querySelector('[data-action="edit"]').addEventListener('click', ()=> startEditDayEvent(ev));
    row.querySelector('[data-action="del"]').addEventListener('click', ()=> deleteDayEvent(ev.id));
    box.appendChild(row);
  });
}

function resetDayEventForm(){
  editingDayEventId = null;
  $('day-event-form').reset();
  $('day-event-id').value = "";
  $('day-event-submit-btn').textContent = "+ เพิ่มรายการนี้";
  $('cancel-day-event-edit-btn').classList.add('hidden');
}

function startEditDayEvent(ev){
  editingDayEventId = ev.id;
  $('day-event-id').value = ev.id;
  $('day-event-category').value = ev.category;
  $('day-event-title').value = ev.title;
  $('day-event-time').value = ev.event_time || "";
  $('day-event-note').value = ev.note || "";
  $('day-event-submit-btn').textContent = "บันทึกการแก้ไข";
  $('cancel-day-event-edit-btn').classList.remove('hidden');
}
$('cancel-day-event-edit-btn').addEventListener('click', resetDayEventForm);

$('day-event-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload = {
    user_id: currentUser.id,
    event_date: selectedDayStr,
    category: $('day-event-category').value,
    title: $('day-event-title').value.trim(),
    event_time: $('day-event-time').value || null,
    note: $('day-event-note').value.trim()
  };
  if (editingDayEventId){
    const { error } = await supabaseClient.from('calendar_events').update(payload).eq('id', editingDayEventId);
    if (error){ showToast("บันทึกไม่สำเร็จ"); return; }
    const idx = calendarEvents.findIndex(x=>x.id===editingDayEventId);
    calendarEvents[idx] = { ...calendarEvents[idx], ...payload };
  } else {
    const { data, error } = await supabaseClient.from('calendar_events').insert(payload).select().single();
    if (error){ showToast("เพิ่มรายการไม่สำเร็จ"); return; }
    calendarEvents.push(data);
  }
  resetDayEventForm();
  renderDayEvents();
  renderCalendar();
  showToast("บันทึกเรียบร้อย ✓");
});

async function deleteDayEvent(id){
  if (!confirm("ต้องการลบรายการนี้ใช่ไหม?")) return;
  const { error } = await supabaseClient.from('calendar_events').delete().eq('id', id);
  if (error){ showToast("ลบไม่สำเร็จ"); return; }
  calendarEvents = calendarEvents.filter(x=>x.id!==id);
  if (editingDayEventId === id) resetDayEventForm();
  renderDayEvents();
  renderCalendar();
}

$('close-day-modal-btn').addEventListener('click', ()=> $('day-modal').classList.add('hidden'));

// ---------------- util ----------------
function escapeHtml(str){
  if (!str) return "";
  return str.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
