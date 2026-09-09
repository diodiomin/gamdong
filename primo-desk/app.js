(() => {
'use strict';

const TYPES = ['증명·여권','프로필','가족사진','반려동물','아기 100일','아기 돌','웨딩','기타'];
const SOURCES = ['네이버','전화','카카오','방문','기타'];
const VAULT_KEY = 'primo_desk_vault_v1';
const SALT_KEY = 'primo_desk_salt_v1';
const AAD = new TextEncoder().encode('PRIMO-DESK-v1');
const AUTO_LOCK_MS = 15 * 60 * 1000;
let cryptoKey = null;
let state = null;
let currentMonth = new Date();
let activeView = 'home';
let inactivityTimer = null;
let lastOcrObjectUrl = null;

const $ = (id) => document.getElementById(id);
const qs = (s, root=document) => root.querySelector(s);
const qsa = (s, root=document) => [...root.querySelectorAll(s)];

function defaultState(){
  return {version:1, bookings:[], customers:[], settings:{familyReminder7:true,familyReminder1:true}, updatedAt:Date.now()};
}
function bytesToB64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes)));}
function b64ToBytes(s){return Uint8Array.from(atob(s), c=>c.charCodeAt(0));}
async function deriveKey(password, salt){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'}, base, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
}
async function encryptState(data){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD}, cryptoKey, plain);
  return JSON.stringify({iv:bytesToB64(iv),cipher:bytesToB64(cipher)});
}
async function decryptState(payload, key){
  const p = JSON.parse(payload);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(p.iv),additionalData:AAD}, key, b64ToBytes(p.cipher));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function saveState(){
  if(!cryptoKey || !state) return;
  state.updatedAt = Date.now();
  localStorage.setItem(VAULT_KEY, await encryptState(state));
}

function initLock(){
  const hasVault = localStorage.getItem(VAULT_KEY) && localStorage.getItem(SALT_KEY);
  $('setupBox').classList.toggle('hidden', !!hasVault);
  $('unlockBox').classList.toggle('hidden', !hasVault);
  if(hasVault) setTimeout(()=>$('unlockPassword').focus(),50); else setTimeout(()=>$('setupPassword').focus(),50);
}
async function setupVault(){
  const p1=$('setupPassword').value, p2=$('setupPassword2').value;
  if(p1.length<8){showLockMessage('비밀번호는 8자 이상으로 정해주세요.');return;}
  if(p1!==p2){showLockMessage('비밀번호 확인이 맞지 않습니다.');return;}
  const salt=crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, bytesToB64(salt));
  cryptoKey=await deriveKey(p1,salt); state=defaultState(); await saveState(); unlockUI();
}
async function unlockVault(){
  try{
    const salt=b64ToBytes(localStorage.getItem(SALT_KEY));
    const key=await deriveKey($('unlockPassword').value,salt);
    const data=await decryptState(localStorage.getItem(VAULT_KEY),key);
    cryptoKey=key; state=data; unlockUI();
  }catch(e){showLockMessage('비밀번호가 맞지 않거나 데이터가 손상되었습니다.');}
}
function unlockUI(){
  $('lockScreen').classList.add('hidden'); $('app').classList.remove('hidden'); $('app').setAttribute('aria-hidden','false');
  $('setupPassword').value='';$('setupPassword2').value='';$('unlockPassword').value='';showLockMessage('');
  bindStateSettings(); populateSelects(); renderAll(); resetInactivity();
}
function lockApp(){
  cryptoKey=null; state=null;
  $('app').classList.add('hidden'); $('app').setAttribute('aria-hidden','true'); $('lockScreen').classList.remove('hidden');
  qsa('.modal').forEach(m=>m.classList.add('hidden')); initLock();
}
function showLockMessage(msg){$('lockMessage').textContent=msg;}
function resetInactivity(){clearTimeout(inactivityTimer); if(cryptoKey) inactivityTimer=setTimeout(lockApp,AUTO_LOCK_MS);}
['click','keydown','mousemove','touchstart'].forEach(ev=>document.addEventListener(ev,resetInactivity,{passive:true}));

function uid(prefix='id'){return `${prefix}_${Date.now().toString(36)}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;}
function escPhone(raw=''){return raw.replace(/\D/g,'').slice(0,11);}
function formatPhone(raw=''){
  const n=escPhone(raw); if(n.length===11)return `${n.slice(0,3)}-${n.slice(3,7)}-${n.slice(7)}`; if(n.length===10)return `${n.slice(0,3)}-${n.slice(3,6)}-${n.slice(6)}`; return raw;
}
function maskPhone(raw=''){
  const n=escPhone(raw); if(n.length>=10) return `${n.slice(0,3)}-${n.slice(3,5)}••-${n.slice(-4)}`; return formatPhone(raw);
}
function localDateStr(d=new Date()){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10);}
function prettyDate(s){if(!s)return '-'; const d=new Date(`${s}T00:00:00`); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;}
function koToday(){return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());}
function bookingSort(a,b){return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);}
function findCustomerByPhone(phone){const n=escPhone(phone); return state.customers.find(c=>escPhone(c.phone)===n);}
function getCustomerVisits(c){return state.bookings.filter(b=>b.customerId===c.id && b.status==='방문완료').length;}
function getCustomerBookings(c){return state.bookings.filter(b=>b.customerId===c.id).sort((a,b)=>bookingSort(b,a));}

function ensureCustomerFromBooking(b){
  let c=findCustomerByPhone(b.phone);
  if(!c){c={id:uid('cus'),name:b.name,phone:formatPhone(b.phone),notes:'',babyName:b.babyName||'',babyBirth:b.babyBirth||'',createdAt:Date.now()};state.customers.push(c);}
  else {c.name=b.name||c.name; c.phone=formatPhone(b.phone); if(b.babyName)c.babyName=b.babyName; if(b.babyBirth)c.babyBirth=b.babyBirth;}
  b.customerId=c.id; return c;
}

function populateSelects(){
  ['bType','oType'].forEach(id=>{$(id).innerHTML=TYPES.map(x=>`<option value="${x}">${x}</option>`).join('');});
  $('bSource').innerHTML=SOURCES.map(x=>`<option value="${x}">${x}</option>`).join('');
  $('bookingFilterType').innerHTML='<option value="">전체 촬영</option>'+TYPES.map(x=>`<option value="${x}">${x}</option>`).join('');
  $('bookingFilterSource').innerHTML='<option value="">전체 경로</option>'+SOURCES.map(x=>`<option value="${x}">${x}</option>`).join('');
}
function bindStateSettings(){
  $('reminder7').checked=!!state.settings.familyReminder7; $('reminder1').checked=!!state.settings.familyReminder1;
}
function renderAll(){
  $('todayLabel').textContent=koToday(); renderStats(); renderCalendar(); renderToday(); renderBookingTable(); renderCustomerTable(); renderReminders();
}
function renderStats(){
  const today=localDateStr();
  const todayBookings=state.bookings.filter(b=>b.date===today && b.status!=='취소');
  const upcoming=state.bookings.filter(b=>b.date>today && b.status==='예약').length;
  const done=state.bookings.filter(b=>b.date===today && b.status==='방문완료').length;
  const reminders=getDueReminders().length;
  $('stats').innerHTML=`
    <div class="stat"><span>오늘 예약</span><strong>${todayBookings.length}</strong></div>
    <div class="stat"><span>오늘 방문완료</span><strong>${done}</strong></div>
    <div class="stat"><span>예정 예약</span><strong>${upcoming}</strong></div>
    <div class="stat"><span>안내 필요</span><strong>${reminders}</strong></div>`;
}
function renderCalendar(){
  const y=currentMonth.getFullYear(), m=currentMonth.getMonth();
  $('calendarTitle').textContent=`${y}년 ${m+1}월`;
  const first=new Date(y,m,1), start=new Date(y,m,1-first.getDay());
  const today=localDateStr(); let html='';
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i); const ds=localDateStr(d); const other=d.getMonth()!==m;
    const events=state.bookings.filter(b=>b.date===ds && b.status!=='취소').sort(bookingSort).slice(0,3);
    html+=`<div class="day ${other?'other':''} ${ds===today?'today':''}" data-date="${ds}"><div class="day-num"><span>${d.getDate()}</span>${state.bookings.filter(b=>b.date===ds&&b.status!=='취소').length>3?'<span>＋</span>':''}</div>${events.map(b=>`<div class="event-chip ${b.type==='가족사진'?'family':''} ${b.type.startsWith('아기')?'baby':''} ${b.status==='방문완료'?'complete':''}" data-booking-id="${b.id}" title="${b.time} ${b.name} ${b.type}">${b.time} ${escapeHtml(b.name)}</div>`).join('')}</div>`;
  }
  $('calendarGrid').innerHTML=html;
  qsa('.day').forEach(el=>el.addEventListener('dblclick',()=>openBookingModal({date:el.dataset.date})));
  qsa('.event-chip').forEach(el=>el.addEventListener('click',(e)=>{e.stopPropagation();openBookingModal({bookingId:el.dataset.bookingId});}));
}
function renderToday(){
  const today=localDateStr(); const items=state.bookings.filter(b=>b.date===today&&b.status!=='취소').sort(bookingSort);
  $('todayCountBadge').textContent=`${items.length}건`;
  $('todayBookings').innerHTML=items.length?items.map(b=>`<div class="list-item"><div class="time">${b.time}</div><div><strong>${escapeHtml(b.name)} · ${escapeHtml(b.type)}</strong><p>${maskPhone(b.phone)} · ${escapeHtml(b.source)}</p></div><button class="link-btn" data-edit-booking="${b.id}">열기</button></div>`).join(''):'<div class="empty">오늘 예약이 없습니다.</div>';
  qsa('[data-edit-booking]').forEach(x=>x.addEventListener('click',()=>openBookingModal({bookingId:x.dataset.editBooking})));
}
function renderBookingTable(){
  const q=($('bookingSearch').value||'').trim().toLowerCase(), type=$('bookingFilterType').value, source=$('bookingFilterSource').value;
  let list=[...state.bookings].sort((a,b)=>bookingSort(b,a));
  list=list.filter(b=>(!type||b.type===type)&&(!source||b.source===source)&&(!q||`${b.name} ${b.phone} ${b.memo} ${b.type}`.toLowerCase().includes(q)));
  $('bookingTable').innerHTML=`<table class="data-table"><thead><tr><th>날짜</th><th>시간</th><th>고객</th><th>촬영</th><th>경로</th><th>상태</th><th></th></tr></thead><tbody>${list.map(b=>`<tr><td>${prettyDate(b.date)}</td><td>${b.time}</td><td><button class="link-btn" data-customer="${b.customerId}">${escapeHtml(b.name)}</button><div class="masked">${maskPhone(b.phone)}</div></td><td>${escapeHtml(b.type)}</td><td>${escapeHtml(b.source)}</td><td>${escapeHtml(b.status)}</td><td><button class="link-btn" data-edit-booking="${b.id}">수정</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">등록된 예약이 없습니다.</td></tr>'}</tbody></table>`;
  qsa('[data-edit-booking]').forEach(x=>x.addEventListener('click',()=>openBookingModal({bookingId:x.dataset.editBooking})));
  qsa('[data-customer]').forEach(x=>x.addEventListener('click',()=>openCustomer(x.dataset.customer)));
}
function renderCustomerTable(){
  const q=($('customerSearch').value||'').trim().toLowerCase();
  const list=state.customers.filter(c=>!q||`${c.name} ${c.phone}`.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  $('customerTable').innerHTML=`<table class="data-table"><thead><tr><th>고객명</th><th>전화번호</th><th>방문</th><th>최근 촬영</th><th>아기 촬영</th><th></th></tr></thead><tbody>${list.map(c=>{const bs=getCustomerBookings(c),last=bs.find(b=>b.status==='방문완료')||bs[0];const baby=bs.filter(b=>b.type.startsWith('아기')).map(b=>b.type.replace('아기 ','')).join(' · ');return `<tr><td><strong>${escapeHtml(c.name)}</strong></td><td class="masked">${maskPhone(c.phone)}</td><td>${getCustomerVisits(c)}회</td><td>${last?`${prettyDate(last.date)} · ${escapeHtml(last.type)}`:'-'}</td><td>${baby||'-'}</td><td><button class="link-btn" data-customer="${c.id}">고객 보기</button></td></tr>`;}).join('')||'<tr><td colspan="6" class="empty">등록된 고객이 없습니다.</td></tr>'}</tbody></table>`;
  qsa('[data-customer]').forEach(x=>x.addEventListener('click',()=>openCustomer(x.dataset.customer)));
}
function getDueReminders(){
  const today=new Date(`${localDateStr()}T00:00:00`); const due=[];
  state.bookings.filter(b=>b.type==='가족사진'&&b.status==='예약').forEach(b=>{
    const d=new Date(`${b.date}T00:00:00`); const diff=Math.round((d-today)/86400000);
    if((state.settings.familyReminder7&&diff===7)||(state.settings.familyReminder1&&diff===1)) due.push({...b,daysBefore:diff});
  }); return due.sort(bookingSort);
}
function reminderText(b){
  const when=b.daysBefore===1?'내일':'일주일 후';
  return `${b.name} 고객님, 안녕하세요. 감동사진관입니다. ${when} ${b.date} ${b.time} 가족사진 촬영 예약이 있어 안내드립니다. 일정 변경이 필요하시면 사진관으로 연락 부탁드립니다. 감사합니다.`;
}
function renderReminders(){
  const list=getDueReminders(); $('reminderCountBadge').textContent=`${list.length}건`;
  $('homeReminders').innerHTML=list.length?list.slice(0,4).map(b=>`<div class="list-item"><div class="time">D-${b.daysBefore}</div><div><strong>${escapeHtml(b.name)} · 가족사진</strong><p>${b.date} ${b.time}</p></div><button class="link-btn" data-copy-reminder="${b.id}|${b.daysBefore}">문구 복사</button></div>`).join(''):'<div class="empty">오늘 보낼 안내가 없습니다.</div>';
  $('reminderList').innerHTML=list.length?list.map(b=>`<div class="reminder-card"><h3>${escapeHtml(b.name)} · D-${b.daysBefore}</h3><p>${prettyDate(b.date)} ${b.time} · 가족사진</p><p>${maskPhone(b.phone)}</p><div class="actions"><button class="primary" data-copy-reminder="${b.id}|${b.daysBefore}">안내 문구 복사</button><button class="ghost" data-edit-booking="${b.id}">예약 보기</button></div></div>`).join(''):'<div class="empty">현재 안내 예정 고객이 없습니다.</div>';
  qsa('[data-copy-reminder]').forEach(x=>x.addEventListener('click',async()=>{const [id,days]=x.dataset.copyReminder.split('|');const b=state.bookings.find(v=>v.id===id);if(!b)return;b.daysBefore=Number(days);await navigator.clipboard.writeText(reminderText(b));toast('안내 문구를 복사했습니다.');}));
  qsa('[data-edit-booking]').forEach(x=>x.addEventListener('click',()=>openBookingModal({bookingId:x.dataset.editBooking})));
}

function openBookingModal({date,bookingId,prefill}={}){
  const b=bookingId?state.bookings.find(x=>x.id===bookingId):null;
  $('bookingModalTitle').textContent=b?'예약 수정':'예약 등록'; $('bookingId').value=b?.id||'';
  $('bDate').value=b?.date||prefill?.date||date||localDateStr(); $('bTime').value=b?.time||prefill?.time||'10:00'; $('bName').value=b?.name||prefill?.name||''; $('bPhone').value=b?.phone||prefill?.phone||''; $('bType').value=b?.type||prefill?.type||TYPES[0]; $('bSource').value=b?.source||prefill?.source||'전화'; $('bStatus').value=b?.status||'예약'; $('bMemo').value=b?.memo||prefill?.memo||''; $('bBabyName').value=b?.babyName||''; $('bBabyBirth').value=b?.babyBirth||'';
  toggleBabyFields(); updateExistingCustomerHint(); $('bookingModal').classList.remove('hidden'); setTimeout(()=>$('bName').focus(),50);
}
function toggleBabyFields(){const baby=$('bType').value.startsWith('아기');$('babyNameWrap').classList.toggle('hidden',!baby);$('babyBirthWrap').classList.toggle('hidden',!baby);}
function updateExistingCustomerHint(){
  const c=findCustomerByPhone($('bPhone').value); const box=$('existingCustomerHint');
  if(c){box.classList.remove('hidden');box.textContent=`기존 고객 · ${c.name} · 방문 ${getCustomerVisits(c)}회 · 최근 예약 ${getCustomerBookings(c)[0]?.date||'-'}`;}else box.classList.add('hidden');
}
async function submitBooking(e){
  e.preventDefault(); const id=$('bookingId').value; let b=id?state.bookings.find(x=>x.id===id):null;
  const data={date:$('bDate').value,time:$('bTime').value,name:$('bName').value.trim(),phone:formatPhone($('bPhone').value),type:$('bType').value,source:$('bSource').value,status:$('bStatus').value,memo:$('bMemo').value.trim(),babyName:$('bBabyName').value.trim(),babyBirth:$('bBabyBirth').value};
  if(!data.date||!data.time||!data.name||escPhone(data.phone).length<10){toast('날짜, 시간, 고객명, 전화번호를 확인해주세요.');return;}
  if(b) Object.assign(b,data,{updatedAt:Date.now()}); else {b={id:uid('book'),createdAt:Date.now(),...data};state.bookings.push(b);} ensureCustomerFromBooking(b); await saveState(); closeModal('bookingModal'); renderAll(); toast(id?'예약을 수정했습니다.':'예약을 등록했습니다.');
}
function openCustomer(id){
  const c=state.customers.find(x=>x.id===id); if(!c)return; $('customerNameTitle').textContent=c.name; const bs=getCustomerBookings(c),visits=getCustomerVisits(c); const baby100=bs.find(b=>b.type==='아기 100일'), babyDol=bs.find(b=>b.type==='아기 돌');
  $('customerDetail').innerHTML=`<div class="customer-summary"><div class="summary-box"><span>전화번호</span><strong>${maskPhone(c.phone)}</strong></div><div class="summary-box"><span>방문횟수</span><strong>${visits}회</strong></div><div class="summary-box"><span>100일</span><strong>${baby100?prettyDate(baby100.date):'-'}</strong></div><div class="summary-box"><span>돌</span><strong>${babyDol?prettyDate(babyDol.date):'-'}</strong></div></div><div class="customer-notes"><label>고객 메모<textarea id="customerNotesEdit" rows="3">${escapeHtml(c.notes||'')}</textarea></label><div class="modal-actions"><button id="saveCustomerNotes" class="primary">메모 저장</button></div></div><h3>촬영·예약 이력</h3><div class="history">${bs.map(b=>`<div class="history-row"><span>${prettyDate(b.date)}</span><span>${b.time}</span><span>${escapeHtml(b.type)} · ${escapeHtml(b.source)}</span><button class="link-btn" data-edit-booking="${b.id}">${escapeHtml(b.status)}</button></div>`).join('')||'<div class="empty">이력이 없습니다.</div>'}</div>`;
  $('customerModal').classList.remove('hidden'); $('saveCustomerNotes').addEventListener('click',async()=>{c.notes=$('customerNotesEdit').value.trim();await saveState();toast('고객 메모를 저장했습니다.');renderCustomerTable();}); qsa('[data-edit-booking]',$('customerDetail')).forEach(x=>x.addEventListener('click',()=>{closeModal('customerModal');openBookingModal({bookingId:x.dataset.editBooking});}));
}
function closeModal(id){$(id).classList.add('hidden'); if(id==='ocrModal'&&lastOcrObjectUrl){URL.revokeObjectURL(lastOcrObjectUrl);lastOcrObjectUrl=null;}}

async function handlePaste(e){
  if(!cryptoKey)return; const item=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/')); if(!item)return; e.preventDefault(); const file=item.getAsFile(); if(file) await startOcr(file);
}
async function startOcr(file){
  closeModal('ocrModal'); if(lastOcrObjectUrl)URL.revokeObjectURL(lastOcrObjectUrl); lastOcrObjectUrl=URL.createObjectURL(file); $('ocrPreview').src=lastOcrObjectUrl; $('ocrText').value=''; ['oDate','oTime','oName','oPhone'].forEach(id=>$(id).value=''); $('oType').value=TYPES[0]; $('ocrProgress').textContent='브라우저 안에서 한글 예약 정보를 읽는 중입니다… 처음 실행은 언어파일 때문에 조금 더 걸릴 수 있어요.'; $('ocrModal').classList.remove('hidden');
  try{
    if(!window.Tesseract) throw new Error('OCR 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.');
    const result=await window.Tesseract.recognize(file,'kor+eng',{logger:m=>{if(m.status==='recognizing text')$('ocrProgress').textContent=`예약 내용을 읽는 중… ${Math.round((m.progress||0)*100)}%`;}});
    const text=result.data.text||''; $('ocrText').value=text; const p=parseOcrText(text); $('oDate').value=p.date||'';$('oTime').value=p.time||'';$('oName').value=p.name||'';$('oPhone').value=p.phone||'';$('oType').value=p.type||TYPES[0]; $('ocrProgress').textContent='인식이 끝났습니다. 아래 내용을 꼭 확인한 뒤 등록해주세요.';
  }catch(err){$('ocrProgress').textContent=`인식 실패: ${err.message||err}`;}
}
function parseOcrText(text){
  const clean=text.replace(/\r/g,' '); let date='',time='',name='',phone='',type='';
  const iso=clean.match(/(20\d{2})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})/); const ko=clean.match(/(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
  if(iso)date=`${iso[1]}-${String(iso[2]).padStart(2,'0')}-${String(iso[3]).padStart(2,'0')}`; else if(ko){const y=ko[1]||new Date().getFullYear();date=`${y}-${String(ko[2]).padStart(2,'0')}-${String(ko[3]).padStart(2,'0')}`;}
  const kt=clean.match(/(오전|오후)\s*(\d{1,2})\s*[:시]\s*(\d{1,2})?/); const t24=clean.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if(kt){let h=Number(kt[2]);const min=Number(kt[3]||0);if(kt[1]==='오후'&&h<12)h+=12;if(kt[1]==='오전'&&h===12)h=0;time=`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;} else if(t24)time=`${String(t24[1]).padStart(2,'0')}:${t24[2]}`;
  const ph=clean.match(/01[016789][\s\-.]?\d{3,4}[\s\-.]?\d{4}/); if(ph)phone=formatPhone(ph[0]);
  const named=clean.match(/(?:예약자|예약자명|이름|고객명)\s*[:：]?\s*([가-힣]{2,5})/); const nim=clean.match(/([가-힣]{2,5})\s*님/); if(named)name=named[1]; else if(nim)name=nim[1];
  type=TYPES.find(x=>clean.includes(x.replace('·','')))||''; if(!type){if(/가족/.test(clean))type='가족사진';else if(/100일|백일/.test(clean))type='아기 100일';else if(/돌사진|돌 촬영|돌촬영/.test(clean))type='아기 돌';else if(/프로필|취업/.test(clean))type='프로필';else if(/여권|증명/.test(clean))type='증명·여권';else if(/반려|강아지|고양이/.test(clean))type='반려동물';}
  return {date,time,name,phone,type};
}
function ocrToBooking(){openBookingModal({prefill:{date:$('oDate').value,time:$('oTime').value,name:$('oName').value,phone:$('oPhone').value,type:$('oType').value,source:'네이버',memo:'네이버 예약 캡처에서 가져옴'}}); closeModal('ocrModal');}

function getViewTitle(v){return {home:'오늘 예약',calendar:'예약 캘린더',customers:'고객관리',reminders:'안내 예정',settings:'설정'}[v]||'PRIMO DESK';}
function switchView(v){activeView=v;qsa('.view').forEach(x=>x.classList.remove('active'));$(`${v}View`).classList.add('active');qsa('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('viewTitle').textContent=getViewTitle(v); if(v==='calendar')renderBookingTable();if(v==='customers')renderCustomerTable();if(v==='reminders')renderReminders();}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add('hidden'),2400);}
async function exportBackup(){const payload={app:'PRIMO DESK',version:1,exportedAt:new Date().toISOString(),salt:localStorage.getItem(SALT_KEY),vault:localStorage.getItem(VAULT_KEY)};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`primo-desk-backup-${localDateStr()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function importBackup(file){try{const p=JSON.parse(await file.text());if(p.app!=='PRIMO DESK'||!p.salt||!p.vault)throw new Error('올바른 백업 파일이 아닙니다.');if(!confirm('현재 데이터를 백업 파일로 바꿀까요?'))return;localStorage.setItem(SALT_KEY,p.salt);localStorage.setItem(VAULT_KEY,p.vault);toast('백업을 가져왔습니다. 다시 로그인해주세요.');setTimeout(lockApp,800);}catch(e){toast(e.message||'백업을 가져오지 못했습니다.');}}
async function clearAll(){if(!confirm('고객과 예약 데이터를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))return;state=defaultState();await saveState();renderAll();toast('모든 데이터를 초기화했습니다.');}

function bind(){
  $('setupBtn').addEventListener('click',setupVault);$('unlockBtn').addEventListener('click',unlockVault);$('unlockPassword').addEventListener('keydown',e=>{if(e.key==='Enter')unlockVault();});$('setupPassword2').addEventListener('keydown',e=>{if(e.key==='Enter')setupVault();});
  qsa('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view))); $('newBookingBtn').addEventListener('click',()=>openBookingModal()); $('bookingForm').addEventListener('submit',submitBooking); $('bType').addEventListener('change',toggleBabyFields); $('bPhone').addEventListener('input',updateExistingCustomerHint);
  qsa('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close))); qsa('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));
  $('prevMonth').addEventListener('click',()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1);renderCalendar();}); $('nextMonth').addEventListener('click',()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1);renderCalendar();}); $('todayMonth').addEventListener('click',()=>{currentMonth=new Date();renderCalendar();});
  ['bookingSearch','bookingFilterType','bookingFilterSource'].forEach(id=>$(id).addEventListener('input',renderBookingTable)); $('customerSearch').addEventListener('input',renderCustomerTable);
  $('reminder7').addEventListener('change',async()=>{state.settings.familyReminder7=$('reminder7').checked;await saveState();renderReminders();renderStats();}); $('reminder1').addEventListener('change',async()=>{state.settings.familyReminder1=$('reminder1').checked;await saveState();renderReminders();renderStats();});
  $('backupBtn').addEventListener('click',exportBackup);$('importBackup').addEventListener('change',e=>{const f=e.target.files[0];if(f)importBackup(f);e.target.value='';});$('lockBtn').addEventListener('click',lockApp);$('clearAllBtn').addEventListener('click',clearAll);
  document.addEventListener('paste',handlePaste); $('pasteHintBtn').addEventListener('click',()=>{$('pasteZone').focus();toast('네이버 예약을 Print Screen한 뒤 Ctrl+V 하세요.');});$('ocrToBooking').addEventListener('click',ocrToBooking);
}

bind(); initLock();
})();
