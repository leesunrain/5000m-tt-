'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const clone = (x) => JSON.parse(JSON.stringify(x));

const SLOT_MATCH = location.pathname.match(/\/nirc\/apps\/(\d+)/);
const SLOT_NO = SLOT_MATCH ? SLOT_MATCH[1] : null;
const SHARED_GET_URL = SLOT_NO ? `/api/nirc-app/${SLOT_NO}/shared` : null;
const SHARED_PUT_URL = SLOT_NO ? `/api/nirc-admin/apps/${SLOT_NO}/shared` : null;

let data = clone(window.INITIAL_DATA || {});
let previewRows = [];
let selectedImageFile = null;
let selectedImageUrl = null;
let ocrScriptPromise = null;

function toSec(t){
  if(!t) return null;
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function fmt(s){
  if(s == null || !Number.isFinite(Number(s))) return '-';
  const n = Math.round(Number(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2,'0')}`;
}
function pace5k(t){const s=toSec(t);return s==null?'-':`${fmt(s/5)}/km`;}
function lap400(t){const s=toSec(t);return s==null?'-':`${Math.round(s/12.5)}초`;}
function dates(){return Object.keys(data || {}).sort();}
function allNames(){return Array.from(new Set(dates().flatMap(d => (data[d]||[]).map(r=>r.name)))).sort((a,b)=>a.localeCompare(b,'ko'));}
function history(name){return dates().map(date=>({date,row:(data[date]||[]).find(r=>r.name===name)})).filter(x=>x.row);}
function isPB(name,date,time){
  const s=toSec(time); if(s==null) return false;
  const prev=history(name).filter(x=>x.date<date).map(x=>toSec(x.row.time)).filter(Number.isFinite);
  return prev.length>0 && prev.every(v=>s<v);
}
function diffPrev(name,date,time){
  const prev=history(name).filter(x=>x.date<date);
  if(!prev.length) return null;
  const current=toSec(time), old=toSec(prev[prev.length-1].row.time);
  return current==null||old==null?null:current-old;
}
function bestBefore(name,date){
  const vals=history(name).filter(x=>x.date<date).map(x=>toSec(x.row.time)).filter(Number.isFinite);
  return vals.length?Math.min(...vals):null;
}
function pbGain(name,date,time){const b=bestBefore(name,date),s=toSec(time);return b!=null&&s!=null&&s<b?b-s:null;}
function displayDate(d){if(!d)return '-';const p=d.split('-');return p.length===3?`${p[0]}.${p[1]}.${p[2]}`:d;}
function monthLabel(d){if(!d)return '최근';const p=d.split('-');return `${Number(p[1]||0)}월`;}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setPortalStatus(msg,type=''){
  const el=$('#portalStatus'); el.textContent=msg; el.className=`portal-status ${type}`.trim();
}
function setImportMsg(msg,type=''){
  const el=$('#importMsg'); el.textContent=msg; el.className=`status ${type}`.trim();
}
function normalizeRow(r){
  if(!r || typeof r!=='object') return null;
  const name=String(r.name||'').trim();
  const time=String(r.time||r.record||'').trim();
  if(!name || toSec(time)==null) return null;
  const vdotVal=r.vdot==null||r.vdot===''?null:Number(r.vdot);
  return {name,group:String(r.group||r.training_group||'').trim(),time,vdot:Number.isFinite(vdotVal)?vdotVal:null};
}
function normalizeRecords(obj){
  if(!obj || typeof obj!=='object' || Array.isArray(obj)) return null;
  const out={};
  for(const [date,rows] of Object.entries(obj)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(rows)) continue;
    const clean=rows.map(normalizeRow).filter(Boolean).sort((a,b)=>toSec(a.time)-toSec(b.time)).map((r,i)=>({...r,rank:i+1}));
    if(clean.length) out[date]=clean;
  }
  return Object.keys(out).length?out:null;
}
function extractSharedPayload(payload){
  if(!payload || typeof payload!=='object') return null;
  const candidates=[payload.records,payload.data?.records,payload.data,payload.shared?.records,payload.shared,payload];
  for(const c of candidates){const n=normalizeRecords(c);if(n)return n;}
  return null;
}

async function loadPortalShared(){
  if(!SLOT_NO){
    setPortalStatus('포털 슬롯 밖에서 실행 중입니다. 포함된 기본 기록으로 미리보기 합니다.','warn');
    refreshAll(); return;
  }
  try{
    const res=await fetch(SHARED_GET_URL,{method:'GET',credentials:'same-origin',headers:{'Accept':'application/json'}});
    if(res.status===401){setPortalStatus('로그인이 필요합니다. NIRC 포털에 로그인한 뒤 다시 열어 주세요.','error');refreshAll();return;}
    if(res.status===403){setPortalStatus('이 앱의 회원 공용 데이터를 볼 권한이 없습니다. 관리자에게 권한을 확인해 주세요.','error');refreshAll();return;}
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload=await res.json();
    const remote=extractSharedPayload(payload);
    if(remote){data=remote;setPortalStatus(`슬롯 ${SLOT_NO} 공용 기록을 불러왔습니다.`,'ok');}
    else{setPortalStatus('공용 저장 데이터가 아직 없어 포함된 초기 기록을 표시합니다. 감독님이 저장하면 포털 공용 데이터로 전환됩니다.','warn');}
  }catch(err){
    console.error(err);
    setPortalStatus('공용 데이터를 불러오지 못했습니다. 포함된 기록을 표시합니다. 네트워크 연결을 확인해 주세요.','warn');
  }
  refreshAll();
}

async function savePortalShared(){
  if(!SLOT_NO){setImportMsg('포털 슬롯 안에서 열어야 공용 저장할 수 있습니다.','error');return false;}
  const payload={version:1,updated_at:new Date().toISOString(),records:data};
  try{
    const res=await fetch(SHARED_PUT_URL,{
      method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({data:payload})
    });
    if(res.status===401){setImportMsg('로그인이 필요합니다. 감독님 계정으로 로그인한 뒤 다시 저장해 주세요.','error');return false;}
    if(res.status===403){setImportMsg('저장 권한이 없습니다. 공용 기록 저장은 감독님 로그인 상태에서만 가능합니다.','error');return false;}
    if(!res.ok){let detail='';try{detail=await res.text();}catch(e){}throw new Error(`HTTP ${res.status}${detail?` · ${detail.slice(0,120)}`:''}`);}
    setPortalStatus(`슬롯 ${SLOT_NO} 공용 기록이 최신 상태입니다.`,'ok');
    return true;
  }catch(err){console.error(err);setImportMsg('공용 저장에 실패했습니다. 인터넷 연결 또는 포털 권한을 확인해 주세요.','error');return false;}
}

function fillDateSelect(sel,opts,value){
  sel.innerHTML=opts.map(o=>`<option value="${esc(o)}">${esc(displayDate(o))}</option>`).join('');
  if(value&&opts.includes(value))sel.value=value;
}
function initTabs(){
  $$('.tabs button').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.tabs button').forEach(x=>x.classList.remove('active')); $$('.tab').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); const section=$(`#${btn.dataset.tab}`); if(section)section.classList.add('active');
    if(btn.dataset.tab==='athletes')drawAthlete();
  }));
}
function emptyTable(table,cols,msg='표시할 기록이 없습니다.'){
  table.innerHTML=`<tbody><tr><td colspan="${cols}" class="empty-state">${esc(msg)}</td></tr></tbody>`;
}
function renderDashboard(){
  const ds=dates();
  if(!ds.length){
    $('#summaryCards').innerHTML=[['최근 측정','-'],['참가자','0명'],['PB 갱신','0명'],['직전 향상','0명']].map(([a,b])=>`<div class="card"><div class="label">${a}</div><div class="value">${b}</div></div>`).join('');
    $('#improvementList').innerHTML='<div class="empty-state">기록이 없습니다.</div>'; $('#pbRenewList').innerHTML='<div class="empty-state">기록이 없습니다.</div>'; $('#dashMonth').innerHTML=''; emptyTable($('#dashTable'),8); return;
  }
  const latest=ds[ds.length-1], rows=data[latest]||[];
  const pbs=rows.filter(r=>isPB(r.name,latest,r.time)).length;
  const common=rows.map(r=>({r,d:diffPrev(r.name,latest,r.time)})).filter(x=>x.d!=null);
  const improved=common.filter(x=>x.d<0).length;
  $('#summaryCards').innerHTML=[['최근 측정',displayDate(latest)],['참가자',`${rows.length}명`],['PB 갱신',`${pbs}명`],['직전 향상',`${improved}명`]].map(([a,b])=>`<div class="card"><div class="label">${esc(a)}</div><div class="value">${esc(b)}</div></div>`).join('');
  $('#improvementTitle').textContent=`${monthLabel(latest)} 향상도 TOP`;
  const top=common.filter(x=>x.d<0).sort((a,b)=>a.d-b.d).slice(0,8);
  $('#improvementList').innerHTML=top.length?top.map((x,i)=>`<div class="rankline"><span>${i+1}</span><strong>${esc(x.r.name)}</strong><span>${esc(x.r.time)}</span><span class="good">▲ ${Math.abs(x.d)}초</span></div>`).join(''):'<div class="empty-state">비교 가능한 향상 기록이 없습니다.</div>';
  const pbRows=rows.map(r=>({r,g:pbGain(r.name,latest,r.time)})).filter(x=>x.g!=null).sort((a,b)=>b.g-a.g);
  $('#pbRenewList').innerHTML=pbRows.length?pbRows.map(x=>`<div class="rankline pbline"><span>⭐</span><strong>${esc(x.r.name)}</strong><span>${esc(x.r.time)}</span><span class="pb">PB -${x.g}초</span></div>`).join(''):'<div class="empty-state">이번 측정 PB 갱신자가 없습니다.</div>';
  fillDateSelect($('#dashMonth'),ds,$('#dashMonth').value||latest); renderDashTable($('#dashMonth').value||latest);
}
function renderDashTable(date){
  const rows=(data[date]||[]).slice().sort((a,b)=>toSec(a.time)-toSec(b.time)); if(!rows.length){emptyTable($('#dashTable'),8);return;}
  $('#dashTable').innerHTML='<thead><tr><th>순위</th><th>이름</th><th>조</th><th>5000m</th><th>km 페이스</th><th>400m</th><th>VDOT</th><th>직전대비</th></tr></thead><tbody>'+rows.map((r,i)=>{const d=diffPrev(r.name,date,r.time),pb=isPB(r.name,date,r.time);return `<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.group||'-')}</td><td class="${pb?'pb':''}">${esc(r.time)}${pb?' ⭐ PB':''}</td><td>${esc(pace5k(r.time))}</td><td>${esc(lap400(r.time))}</td><td>${esc(r.vdot??'-')}</td><td class="${d<0?'good':d>0?'bad':''}">${d==null?'-':d<0?`▲ ${Math.abs(d)}초`:`▼ ${d}초`}</td></tr>`;}).join('')+'</tbody>';
}
function renderMonthly(){const ds=dates();if(!ds.length){$('#monthSelect').innerHTML='';emptyTable($('#monthlyTable'),8);return;}const latest=ds[ds.length-1];fillDateSelect($('#monthSelect'),ds,$('#monthSelect').value||latest);renderMonthlyTable();}
function renderMonthlyTable(){
  const date=$('#monthSelect').value,q=$('#searchMonthly').value.trim(); const rows=(data[date]||[]).filter(r=>!q||r.name.includes(q)).slice().sort((a,b)=>toSec(a.time)-toSec(b.time));
  if(!rows.length){emptyTable($('#monthlyTable'),8,q?'검색 결과가 없습니다.':'표시할 기록이 없습니다.');return;}
  $('#monthlyTable').innerHTML='<thead><tr><th>순위</th><th>이름</th><th>훈련조</th><th>기록</th><th>km</th><th>400m</th><th>VDOT</th><th>PB</th></tr></thead><tbody>'+rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.group||'-')}</td><td>${esc(r.time)}</td><td>${esc(pace5k(r.time))}</td><td>${esc(lap400(r.time))}</td><td>${esc(r.vdot??'-')}</td><td>${isPB(r.name,date,r.time)?'⭐ PB':'-'}</td></tr>`).join('')+'</tbody>';
}
function renderAthleteSelect(){const names=allNames(),sel=$('#athleteSelect'),old=sel.value;sel.innerHTML=names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');if(old&&names.includes(old))sel.value=old;else if(names.length)sel.value=names[0];}
function drawAthlete(){
  const name=$('#athleteSelect').value; if(!name){$('#athleteSummary').innerHTML='<div class="empty-state">선수 기록이 없습니다.</div>';emptyTable($('#athleteTable'),7);drawChart([]);return;}
  const h=history(name),secs=h.map(x=>toSec(x.row.time)).filter(Number.isFinite); if(!secs.length)return;
  const best=Math.min(...secs),first=secs[0],last=secs[secs.length-1];
  $('#athleteSummary').innerHTML=`<div class="athlete-hero"><div class="mini"><span>PB</span><b>${fmt(best)}</b></div><div class="mini"><span>최근 기록</span><b>${fmt(last)}</b></div><div class="mini"><span>첫 기록 대비</span><b class="${last<=first?'good':'bad'}">${last<=first?'▲ '+(first-last):'▼ '+(last-first)}초</b></div><div class="mini"><span>최근 km 페이스</span><b>${fmt(last/5)}</b></div></div>`;
  $('#athleteTable').innerHTML='<thead><tr><th>측정일</th><th>조</th><th>기록</th><th>km</th><th>400m</th><th>VDOT</th><th>직전대비</th></tr></thead><tbody>'+h.map(x=>{const d=diffPrev(name,x.date,x.row.time),pb=isPB(name,x.date,x.row.time);return `<tr><td>${esc(displayDate(x.date))}</td><td>${esc(x.row.group||'-')}</td><td class="${pb?'pb':''}">${esc(x.row.time)}${pb?' ⭐ PB':''}</td><td>${esc(pace5k(x.row.time))}</td><td>${esc(lap400(x.row.time))}</td><td>${esc(x.row.vdot??'-')}</td><td class="${d<0?'good':d>0?'bad':''}">${d==null?'-':d<0?`▲ ${Math.abs(d)}초`:`▼ ${d}초`}</td></tr>`;}).join('')+'</tbody>';
  drawChart(h);
}
function drawChart(h){
  const c=$('#trendChart'),ctx=c.getContext('2d'),W=c.width,H=c.height,pad=58;ctx.clearRect(0,0,W,H);ctx.font='24px system-ui';ctx.fillStyle='#64748b';
  if(!h.length){ctx.fillText('기록 없음',pad,pad);return;}
  const vals=h.map(x=>toSec(x.row.time)),min=Math.min(...vals)-10,max=Math.max(...vals)+10,span=Math.max(1,max-min);
  ctx.strokeStyle='#cbd5e1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pad,25);ctx.lineTo(pad,H-pad);ctx.lineTo(W-25,H-pad);ctx.stroke();
  const pts=vals.map((v,i)=>({x:h.length===1?W/2:pad+i*(W-pad-35)/(h.length-1),y:25+(v-min)*(H-pad-35)/span,v}));
  ctx.strokeStyle='#172033';ctx.lineWidth=5;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  pts.forEach((p,i)=>{ctx.fillStyle='#f97316';ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#172033';ctx.font='bold 22px system-ui';ctx.fillText(fmt(p.v),p.x-28,p.y-18);ctx.font='18px system-ui';ctx.fillStyle='#64748b';ctx.fillText(`${Number(h[i].date.slice(5,7))}월`,p.x-18,H-22);});
}
function refreshAll(){renderDashboard();renderMonthly();renderAthleteSelect();drawAthlete();}

function parseText(text){
  const lines=String(text||'').trim().split(/\r?\n/).filter(Boolean),out=[];
  for(const rawLine of lines){
    let line=rawLine.trim();
    if(!line)continue;
    if(line.includes('이름') || line.includes('5000m기록'))continue;

    // 1) 기존 CSV/탭 형식은 그대로 지원
    if(/[\t,]/.test(line)){
      const cols=line.split(/[\t,]/).map(s=>s.trim()).filter(Boolean);
      let [name,group,time,vdot]=cols;
      const validTimes=cols.filter(c=>toSec(c)!=null);
      if(validTimes.length){
        // 시간이 여러 개면 가장 뒤의 시간을 현재(9월) 기록으로 사용
        time=validTimes[validTimes.length-1];
        const ti=cols.lastIndexOf(time);
        name=(cols[0]||'').replace(/^[^가-힣A-Za-z]*\d*\.?\s*/,'').trim();
        if(ti>1)group=cols[1];
        else group='';
        vdot='';
      }
      const row=normalizeRow({name,group,time,vdot});
      if(row){out.push(row);continue;}
    }

    // 2) 카톡/문자 복사 형식 지원: ✅9.이창환 22:12 22:17
    // 이모지/체크표시와 앞 순번 제거
    line=line
      .replace(/[✅☑️✔️🔑⭐★◆◇●○▪︎■□👉➡️]/gu,' ')
      .replace(/^\s*\d+\s*[.)、-]?\s*/,'')
      .replace(/\s+/g,' ')
      .trim();

    const timeRe=/(?:^|\s)(\d{1,2}:\d{2})(?=\s|$)/g;
    const matches=[...line.matchAll(timeRe)];
    if(!matches.length)continue;

    // 핵심 규칙: 시간이 2개 이상이면 맨 뒤 시간을 이번 기록으로 사용
    const time=matches[matches.length-1][1];
    const firstTimeStart=matches[0].index + (matches[0][0].startsWith(' ')?1:0);
    let prefix=line.slice(0,firstTimeStart).trim();

    // 이름 앞에 남은 순번/기호 제거
    prefix=prefix.replace(/^\s*\d+\s*[.)、-]?\s*/,'').trim();

    // 이름 뒤에 조가 있으면 분리. 없으면 빈 값.
    let group='';
    const groupMatch=prefix.match(/\s+(S조|\d+조|여성조|일반조|회원조|게스트|none조)$/i);
    if(groupMatch){group=groupMatch[1];prefix=prefix.slice(0,groupMatch.index).trim();}

    const name=prefix.replace(/^[^가-힣A-Za-z]+/,'').trim();
    const row=normalizeRow({name,group,time,vdot:''});
    if(row)out.push(row);
  }
  return out;
}
function showPreview(){
  const table=$('#previewTable');
  if(!previewRows.length){emptyTable(table,6,'가져올 유효한 기록이 없습니다.');$('#saveImport').disabled=true;setImportMsg('이름과 기록(예: 20:15) 형식을 확인해 주세요.','warn');return;}
  table.innerHTML='<thead><tr><th>이름</th><th>조</th><th>기록</th><th>km</th><th>400m</th><th>VDOT</th></tr></thead><tbody>'+previewRows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.group||'-')}</td><td>${esc(r.time)}</td><td>${esc(pace5k(r.time))}</td><td>${esc(lap400(r.time))}</td><td>${esc(r.vdot??'-')}</td></tr>`).join('')+'</tbody>';
  $('#saveImport').disabled=false;setImportMsg(`${previewRows.length}명 인식됨. 내용을 확인한 뒤 공용 저장을 누르세요.`,'ok');
}
async function savePreview(){
  const d=$('#importDate').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){setImportMsg('측정일을 선택해 주세요.','error');return;}if(!previewRows.length){setImportMsg('먼저 미리보기를 실행해 주세요.','warn');return;}
  const old=data[d]?clone(data[d]):null;
  data[d]=previewRows.slice().sort((a,b)=>toSec(a.time)-toSec(b.time)).map((r,i)=>({...r,rank:i+1})); refreshAll();
  $('#saveImport').disabled=true;setImportMsg('포털 공용 데이터에 저장하는 중입니다...');
  const ok=await savePortalShared();
  if(ok){setImportMsg(`${displayDate(d)} 기록 ${data[d].length}명을 공용 저장했습니다.`,'ok');previewRows=[];$('#pasteArea').value='';emptyTable($('#previewTable'),6,'저장이 완료되었습니다.');}
  else{if(old)data[d]=old;else delete data[d];refreshAll();$('#saveImport').disabled=false;}
}
function exportCsv(){
  const d=$('#monthSelect').value,rows=data[d]||[];if(!rows.length)return;
  const lines=[['순위','이름','훈련조','5000m','km페이스','400m','VDOT'].join(',')].concat(rows.map((r,i)=>[i+1,r.name,r.group||'',r.time,pace5k(r.time),lap400(r.time),r.vdot??''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')));
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`NIRC_5000m_${d}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function humanSize(bytes){if(bytes<1024)return `${bytes} B`;if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1048576).toFixed(1)} MB`;}
function resetImageInput(){
  selectedImageFile=null;if(selectedImageUrl){URL.revokeObjectURL(selectedImageUrl);selectedImageUrl=null;}
  $('#resultImage').value='';$('#imagePreview').hidden=true;$('#imagePreview').removeAttribute('src');$('#imageEmpty').hidden=false;$('#imageInfo').hidden=true;$('#runOcr').disabled=true;$('#removeImage').disabled=true;$('#ocrProgress').hidden=true;$('#ocrTextWrap').hidden=true;$('#ocrActions').hidden=true;$('#ocrText').value='';$('#ocrBar').style.width='0';$('#ocrStatus').textContent='준비 중...';
}
function showSelectedImage(file){
  if(!file||!file.type.startsWith('image/')){setImportMsg('이미지 파일을 선택해 주세요.','warn');return;}
  if(file.size>12*1024*1024){setImportMsg('이미지가 너무 큽니다. 12MB 이하 이미지를 선택해 주세요.','warn');return;}
  selectedImageFile=file;if(selectedImageUrl)URL.revokeObjectURL(selectedImageUrl);selectedImageUrl=URL.createObjectURL(file);$('#imagePreview').src=selectedImageUrl;$('#imagePreview').hidden=false;$('#imageEmpty').hidden=true;$('#imageInfo').hidden=false;$('#imageInfo').textContent=`${file.name} · ${humanSize(file.size)}`;$('#runOcr').disabled=false;$('#removeImage').disabled=false;
}
function loadOcrLibrary(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);if(ocrScriptPromise)return ocrScriptPromise;
  ocrScriptPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.async=true;s.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR library unavailable'));s.onerror=()=>reject(new Error('OCR library load failed'));document.head.appendChild(s);});
  return ocrScriptPromise;
}
function cleanupOcrText(text){return String(text||'').replace(/[|¦]/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
async function runImageOcr(){
  if(!selectedImageFile)return;$('#runOcr').disabled=true;$('#ocrProgress').hidden=false;$('#ocrTextWrap').hidden=true;$('#ocrActions').hidden=true;$('#ocrBar').style.width='2%';$('#ocrStatus').textContent='글자 인식 기능을 불러오는 중...';
  try{
    const Tesseract=await loadOcrLibrary();
    const result=await Tesseract.recognize(selectedImageFile,'kor+eng',{logger:m=>{if(m.status==='recognizing text'){const pct=Math.max(2,Math.min(100,Math.round((m.progress||0)*100)));$('#ocrBar').style.width=`${pct}%`;$('#ocrStatus').textContent=`글자 읽는 중... ${pct}%`;}else if(m.status){$('#ocrStatus').textContent=m.status;}}});
    const text=cleanupOcrText(result?.data?.text||'');$('#ocrText').value=text;$('#ocrTextWrap').hidden=false;$('#ocrActions').hidden=false;$('#ocrBar').style.width='100%';$('#ocrStatus').textContent=text?'글자 읽기 완료 — 내용을 확인하고 수정해 주세요.':'글자를 읽지 못했습니다. 더 선명한 이미지를 사용하거나 수동 입력해 주세요.';
  }catch(err){console.error(err);$('#ocrStatus').textContent='이미지 글자 인식을 사용할 수 없습니다. 인터넷 연결을 확인하거나 CSV·붙여넣기로 입력해 주세요.';}finally{$('#runOcr').disabled=false;}
}
function ocrTextToPaste(){const raw=$('#ocrText').value.trim();if(!raw)return;$('#pasteArea').value=raw;$('#pasteArea').scrollIntoView({behavior:'smooth',block:'center'});setImportMsg('인식 내용을 입력칸으로 가져왔습니다. 형식을 확인한 뒤 미리보기를 누르세요.','ok');}

$('#dashMonth').addEventListener('change',e=>renderDashTable(e.target.value));
$('#monthSelect').addEventListener('change',renderMonthlyTable);
$('#searchMonthly').addEventListener('input',renderMonthlyTable);
$('#athleteSelect').addEventListener('change',drawAthlete);
$('#exportCsv').addEventListener('click',exportCsv);
$('#previewImport').addEventListener('click',()=>{previewRows=parseText($('#pasteArea').value);showPreview();});
$('#saveImport').addEventListener('click',savePreview);
$('#clearImport').addEventListener('click',()=>{$('#pasteArea').value='';$('#csvFile').value='';previewRows=[];emptyTable($('#previewTable'),6,'입력 내용을 미리보기 하면 여기에 표시됩니다.');$('#saveImport').disabled=true;setImportMsg('');});
$('#csvFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{$('#pasteArea').value=await f.text();previewRows=parseText($('#pasteArea').value);showPreview();}catch(err){setImportMsg('CSV 파일을 읽지 못했습니다.','error');}});
$('#chooseImage').addEventListener('click',()=>$('#resultImage').click());
$('#resultImage').addEventListener('change',e=>showSelectedImage(e.target.files?.[0]));
$('#removeImage').addEventListener('click',resetImageInput);
$('#runOcr').addEventListener('click',runImageOcr);
$('#ocrToPaste').addEventListener('click',ocrTextToPaste);

initTabs();
emptyTable($('#previewTable'),6,'입력 내용을 미리보기 하면 여기에 표시됩니다.');
loadPortalShared();
