const SUPABASE_URL="https://qrhkrjtjhybtebsvsauu.supabase.co";
const SUPABASE_KEY="sb_publishable_H3c56Is1UjvcC0iAHe_jxw_nx-_AsFR";
const SUPABASE_TABLE="nirc_5000m_tt";
const STORAGE_KEY="nirc5000_v1";
let deferredPrompt=null;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function toSec(t){if(!t)return null;const m=/^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(t);return m?+m[1]*60+ +m[2]:null}
function fmt(s){if(s==null||!isFinite(s))return "-";s=Math.round(s);return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`}
function pace5k(t){const s=toSec(t);return s==null?"-":fmt(s/5)+"/km"}
function lap400(t){const s=toSec(t);return s==null?"-":Math.round(s/12.5)+"초"}
function clone(x){return JSON.parse(JSON.stringify(x))}
let data=(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||clone(window.INITIAL_DATA)}catch(e){return clone(window.INITIAL_DATA)}})();
function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
function dates(){return Object.keys(data).sort()}
function allNames(){return [...new Set(dates().flatMap(d=>data[d].map(r=>r.name)))].sort((a,b)=>a.localeCompare(b,"ko"))}
function history(name){return dates().map(d=>({date:d,row:data[d].find(r=>r.name===name)})).filter(x=>x.row)}
function isPB(name,date,time){
 const s=toSec(time);
 const prev=history(name).filter(x=>x.date<date);
 if(!prev.length) return false;
 return prev.every(x=>toSec(x.row.time)>s);
}
function diffPrev(name,date,time){const h=history(name).filter(x=>x.date<date);if(!h.length)return null;return toSec(time)-toSec(h[h.length-1].row.time)}
function bestBefore(name,date){
 const prev=history(name).filter(x=>x.date<date).map(x=>toSec(x.row.time)).filter(Number.isFinite);
 return prev.length?Math.min(...prev):null;
}
function pbGain(name,date,time){
 const b=bestBefore(name,date), s=toSec(time);
 return b!=null && s<b ? b-s : null;
}
function displayDate(d){const [y,m,day]=d.split("-");return `${y}.${m}.${day}`}
function fillSelect(sel, opts, value){sel.innerHTML=opts.map(o=>`<option value="${o}">${displayDate(o)||o}</option>`).join("");if(value)sel.value=value}
function initTabs(){$$(".tabs button").forEach(b=>b.addEventListener("click",()=>{$$(".tabs button").forEach(x=>x.classList.remove("active"));$$(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#"+b.dataset.tab).classList.add("active");if(b.dataset.tab==="athletes")drawAthlete();}))}
function renderDashboard(){
 const ds=dates(), latest=ds[ds.length-1], prev=ds[ds.length-2], rows=data[latest]||[];
 const pbs=rows.filter(r=>isPB(r.name,latest,r.time)).length;
 const common=rows.map(r=>({r,d:diffPrev(r.name,latest,r.time)})).filter(x=>x.d!=null);
 const improved=common.filter(x=>x.d<0).length;
 $("#summaryCards").innerHTML=[
 ["최근 측정",displayDate(latest)],["참가자",rows.length+"명"],["PB 갱신",pbs+"명"],["전월 향상",improved+"명"]
 ].map(([a,b])=>`<div class="card"><div class="label">${a}</div><div class="value">${b}</div></div>`).join("");
 const top=common.filter(x=>x.d<0).sort((a,b)=>a.d-b.d).slice(0,8);
 $("#improvementList").innerHTML=top.map((x,i)=>`<div class="rankline"><span>${i+1}</span><strong>${x.r.name}</strong><span>${x.r.time}</span><span class="good">▲ ${Math.abs(x.d)}초</span></div>`).join("")||'<p class="hint">비교 가능한 기록이 없습니다.</p>';
 const pbRows=rows.map(r=>({r,g:pbGain(r.name,latest,r.time)})).filter(x=>x.g!=null).sort((a,b)=>b.g-a.g);
 $("#pbRenewList").innerHTML=pbRows.map((x,i)=>`<div class="rankline pbline"><span>⭐</span><strong>${x.r.name}</strong><span>${x.r.time}</span><span class="pb">PB -${x.g}초</span></div>`).join("")||'<p class="hint">이번 달 PB 갱신자가 없습니다.</p>';
 fillSelect($("#dashMonth"),ds,latest); renderDashTable(latest);
}
function renderDashTable(date){
 const rows=(data[date]||[]).slice().sort((a,b)=>toSec(a.time)-toSec(b.time));
 $("#dashTable").innerHTML=`<thead><tr><th>순위</th><th>이름</th><th>조</th><th>5000m</th><th>km 페이스</th><th>400m</th><th>VDOT</th><th>전월대비</th></tr></thead><tbody>`+
 rows.map((r,i)=>{const d=diffPrev(r.name,date,r.time);const pb=isPB(r.name,date,r.time);return `<tr><td>${i+1}</td><td>${r.name}</td><td>${r.group||"-"}</td><td class="${pb?"pb":""}">${r.time}${pb?" ⭐ PB":""}</td><td>${pace5k(r.time)}</td><td>${lap400(r.time)}</td><td>${r.vdot??"-"}</td><td class="${d<0?"good":d>0?"bad":""}">${d==null?"-":d<0?`▲ ${Math.abs(d)}초`:`▼ ${d}초`}</td></tr>`}).join("")+"</tbody>";
}
function renderMonthly(){
 const ds=dates(), latest=ds[ds.length-1]; fillSelect($("#monthSelect"),ds,$("#monthSelect").value||latest); renderMonthlyTable();
}
function renderMonthlyTable(){
 const date=$("#monthSelect").value, q=$("#searchMonthly").value.trim();
 const rows=(data[date]||[]).filter(r=>!q||r.name.includes(q)).slice().sort((a,b)=>toSec(a.time)-toSec(b.time));
 $("#monthlyTable").innerHTML=`<thead><tr><th>순위</th><th>이름</th><th>훈련조</th><th>기록</th><th>km</th><th>400m</th><th>VDOT</th><th>PB</th></tr></thead><tbody>`+
 rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.name}</td><td>${r.group||"-"}</td><td>${r.time}</td><td>${pace5k(r.time)}</td><td>${lap400(r.time)}</td><td>${r.vdot??"-"}</td><td>${isPB(r.name,date,r.time)?"⭐ PB":"-"}</td></tr>`).join("")+"</tbody>";
}
function renderAthleteSelect(){const names=allNames();$("#athleteSelect").innerHTML=names.map(n=>`<option>${n}</option>`).join("");if(names.includes("박영윤"))$("#athleteSelect").value="박영윤"}
function drawAthlete(){
 const name=$("#athleteSelect").value;if(!name)return;const h=history(name);const secs=h.map(x=>toSec(x.row.time));const best=Math.min(...secs),first=secs[0],last=secs[secs.length-1];
 $("#athleteSummary").innerHTML=`<div class="athlete-hero"><div class="mini"><span>PB</span><b>${fmt(best)}</b></div><div class="mini"><span>최근 기록</span><b>${fmt(last)}</b></div><div class="mini"><span>첫 기록 대비</span><b class="${last<=first?"good":"bad"}">${last<=first?"▲ "+(first-last):"▼ "+(last-first)}초</b></div><div class="mini"><span>최근 km 페이스</span><b>${fmt(last/5)}</b></div></div>`;
 $("#athleteTable").innerHTML=`<thead><tr><th>측정일</th><th>조</th><th>기록</th><th>km</th><th>400m</th><th>VDOT</th><th>전월대비</th></tr></thead><tbody>`+
 h.map(x=>{const d=diffPrev(name,x.date,x.row.time);return `<tr><td>${displayDate(x.date)}</td><td>${x.row.group||"-"}</td><td class="${isPB(name,x.date,x.row.time)?"pb":""}">${x.row.time}${isPB(name,x.date,x.row.time)?" ⭐ PB":""}</td><td>${pace5k(x.row.time)}</td><td>${lap400(x.row.time)}</td><td>${x.row.vdot??"-"}</td><td class="${d<0?"good":d>0?"bad":""}">${d==null?"-":d<0?`▲ ${Math.abs(d)}초`:`▼ ${d}초`}</td></tr>`}).join("")+"</tbody>"; drawChart(h);
}
function drawChart(h){
 const c=$("#trendChart"),ctx=c.getContext("2d"),W=c.width,H=c.height,pad=58;ctx.clearRect(0,0,W,H);ctx.font="24px system-ui";ctx.fillStyle="#64748b";
 if(!h.length){ctx.fillText("기록 없음",pad,pad);return} const vals=h.map(x=>toSec(x.row.time)), min=Math.min(...vals)-10,max=Math.max(...vals)+10, span=Math.max(1,max-min);
 ctx.strokeStyle="#cbd5e1";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pad,25);ctx.lineTo(pad,H-pad);ctx.lineTo(W-25,H-pad);ctx.stroke();
 const pts=vals.map((v,i)=>({x:h.length===1?W/2:pad+i*(W-pad-35)/(h.length-1),y:25+(v-min)*(H-pad-35)/span,v}));
 ctx.strokeStyle="#162033";ctx.lineWidth=5;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
 pts.forEach((p,i)=>{ctx.fillStyle="#f97316";ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fill();ctx.fillStyle="#172033";ctx.font="bold 22px system-ui";ctx.fillText(fmt(p.v),p.x-28,p.y-18);ctx.font="18px system-ui";ctx.fillStyle="#64748b";ctx.fillText(h[i].date.slice(5,7)+"월",p.x-18,H-22)});
}
let previewRows=[];
function parseText(text){
 const lines=text.trim().split(/\r?\n/).filter(Boolean); if(!lines.length)return [];
 const out=[]; for(const line of lines){const cols=line.split(/[\t,]/).map(s=>s.trim()); if(!cols.length)continue;
   if(cols[0].includes("이름")||cols[2]?.includes("기록"))continue;
   let [name,group,time,vdot]=cols; if(!name||toSec(time)==null)continue; out.push({name,group:group||"",time,vdot:vdot?Number(vdot):null});
 } return out;
}
function showPreview(){
 $("#previewTable").innerHTML=`<thead><tr><th>이름</th><th>조</th><th>기록</th><th>km</th><th>400m</th><th>VDOT</th></tr></thead><tbody>`+previewRows.map(r=>`<tr><td>${r.name}</td><td>${r.group}</td><td>${r.time}</td><td>${pace5k(r.time)}</td><td>${lap400(r.time)}</td><td>${r.vdot??"-"}</td></tr>`).join("")+"</tbody>";
 $("#saveImport").disabled=!previewRows.length; $("#importMsg").textContent=previewRows.length?`${previewRows.length}명 인식됨. 내용을 확인한 뒤 저장하세요.`:"가져올 유효한 기록이 없습니다.";
}
function savePreview(){const d=$("#importDate").value;if(!d){$("#importMsg").textContent="측정일을 선택하세요.";return}const rows=previewRows.slice().sort((a,b)=>toSec(a.time)-toSec(b.time)).map((r,i)=>({...r,rank:i+1}));data[d]=rows;persist();$("#importMsg").textContent=`${displayDate(d)} 기록 ${rows.length}명을 저장했습니다.`;refreshAll();}
function exportCsv(){
 const d=$("#monthSelect").value, rows=data[d]||[];const lines=[["순위","이름","훈련조","5000m","km페이스","400m","VDOT"].join(",")].concat(rows.map((r,i)=>[i+1,r.name,r.group,r.time,pace5k(r.time),lap400(r.time),r.vdot??""].join(",")));const blob=new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`NIRC_5000m_${d}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function secToTimeString(sec){
 sec=Number(sec);
 if(!Number.isFinite(sec)||sec<=0)return null;
 return `${Math.floor(sec/60)}:${String(Math.round(sec)%60).padStart(2,"0")}`;
}
async function loadFromSupabase(){
 try{
   const url=`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=test_date,name,training_group,time_seconds,vdot&order=test_date.asc,time_seconds.asc`;
   const res=await fetch(url,{headers:{apikey:SUPABASE_KEY}});
   if(!res.ok) throw new Error(`Supabase ${res.status}`);
   const rows=await res.json();
   if(!Array.isArray(rows)||rows.length===0)return false;
   const next={};
   for(const r of rows){
     const t=secToTimeString(r.time_seconds);
     if(!r.test_date||!r.name||!t) continue;
     if(!next[r.test_date]) next[r.test_date]=[];
     next[r.test_date].push({rank:0,name:r.name,group:r.training_group||"",time:t,vdot:r.vdot==null?null:Number(r.vdot)});
   }
   for(const d of Object.keys(next)){next[d].sort((a,b)=>toSec(a.time)-toSec(b.time));next[d].forEach((r,i)=>r.rank=i+1);}
   if(Object.keys(next).length){data=next;localStorage.setItem(STORAGE_KEY,JSON.stringify(data));return true;}
   return false;
 }catch(err){console.warn("Supabase load failed; using local data.",err);return false;}
}

let selectedImageFile=null;
let selectedImageUrl=null;

function humanSize(bytes){
 if(bytes<1024)return `${bytes} B`;
 if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
 return `${(bytes/1024/1024).toFixed(1)} MB`;
}

function resetImageInput(){
 selectedImageFile=null;
 if(selectedImageUrl){URL.revokeObjectURL(selectedImageUrl);selectedImageUrl=null;}
 $("#resultImage").value="";
 $("#imagePreview").hidden=true;
 $("#imagePreview").removeAttribute("src");
 $("#imageEmpty").hidden=false;
 $("#imageInfo").hidden=true;
 $("#imageInfo").textContent="";
 $("#runOcr").disabled=true;
 $("#removeImage").disabled=true;
 $("#ocrProgress").hidden=true;
 $("#ocrTextWrap").hidden=true;
 $("#ocrActions").hidden=true;
 $("#ocrText").value="";
 $("#ocrBar").style.width="0%";
 $("#ocrStatus").textContent="준비 중...";
}

function showSelectedImage(file){
 if(!file || !file.type.startsWith("image/")){
   $("#importMsg").textContent="이미지 파일을 선택해 주세요.";
   return;
 }
 selectedImageFile=file;
 if(selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
 selectedImageUrl=URL.createObjectURL(file);
 $("#imagePreview").src=selectedImageUrl;
 $("#imagePreview").hidden=false;
 $("#imageEmpty").hidden=true;
 $("#imageInfo").hidden=false;
 $("#imageInfo").textContent=`${file.name} · ${humanSize(file.size)}`;
 $("#runOcr").disabled=false;
 $("#removeImage").disabled=false;
 $("#ocrTextWrap").hidden=true;
 $("#ocrActions").hidden=true;
}

function cleanupOcrText(text){
 return (text||"")
   .replace(/[|¦]/g," ")
   .replace(/[ \t]+/g," ")
   .replace(/\n{3,}/g,"\n\n")
   .trim();
}

async function runImageOcr(){
 if(!selectedImageFile)return;
 if(!window.Tesseract){
   $("#ocrProgress").hidden=false;
   $("#ocrStatus").textContent="글자 인식 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.";
   return;
 }
 $("#runOcr").disabled=true;
 $("#ocrProgress").hidden=false;
 $("#ocrTextWrap").hidden=true;
 $("#ocrActions").hidden=true;
 $("#ocrBar").style.width="2%";
 $("#ocrStatus").textContent="이미지 분석 준비 중...";
 try{
   const result=await Tesseract.recognize(selectedImageFile,"kor+eng",{
     logger:m=>{
       if(m.status==="recognizing text"){
         const pct=Math.max(2,Math.min(100,Math.round((m.progress||0)*100)));
         $("#ocrBar").style.width=pct+"%";
         $("#ocrStatus").textContent=`글자 읽는 중... ${pct}%`;
       }else if(m.status){
         $("#ocrStatus").textContent=m.status;
       }
     }
   });
   const text=cleanupOcrText(result?.data?.text||"");
   $("#ocrText").value=text;
   $("#ocrTextWrap").hidden=false;
   $("#ocrActions").hidden=false;
   $("#ocrBar").style.width="100%";
   $("#ocrStatus").textContent=text ? "글자 읽기 완료 — 내용을 확인하고 수정해 주세요." : "글자를 읽지 못했습니다. 더 선명한 이미지를 사용해 주세요.";
 }catch(err){
   console.error(err);
   $("#ocrStatus").textContent="이미지 글자 읽기에 실패했습니다. CSV/붙여넣기 방식도 사용할 수 있습니다.";
 }finally{
   $("#runOcr").disabled=false;
 }
}

function ocrTextToPaste(){
 const raw=$("#ocrText").value.trim();
 if(!raw)return;
 $("#pasteArea").value=raw;
 $("#previewImport").scrollIntoView({behavior:"smooth",block:"center"});
 $("#importMsg").textContent="이미지에서 읽은 내용을 입력칸으로 가져왔습니다. 형식을 확인한 뒤 미리보기를 눌러 주세요.";
}

function refreshAll(){renderDashboard();renderMonthly();renderAthleteSelect();drawAthlete()}
$("#dashMonth").addEventListener("change",e=>renderDashTable(e.target.value));
$("#monthSelect").addEventListener("change",renderMonthlyTable);$("#searchMonthly").addEventListener("input",renderMonthlyTable);$("#athleteSelect").addEventListener("change",drawAthlete);$("#exportCsv").addEventListener("click",exportCsv);
$("#previewImport").addEventListener("click",()=>{previewRows=parseText($("#pasteArea").value);showPreview()});
$("#saveImport").addEventListener("click",savePreview);$("#clearImport").addEventListener("click",()=>{previewRows=[];$("#pasteArea").value="";showPreview()});
$("#csvFile").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;$("#pasteArea").value=await f.text();previewRows=parseText($("#pasteArea").value);showPreview()});
$("#chooseImage").addEventListener("click",()=>$("#resultImage").click());
$("#imageDrop").addEventListener("click",e=>{
 if(e.target.id==="chooseImage")return;
});
$("#resultImage").addEventListener("change",e=>showSelectedImage(e.target.files?.[0]));
$("#removeImage").addEventListener("click",resetImageInput);
$("#runOcr").addEventListener("click",runImageOcr);
$("#ocrToPaste").addEventListener("click",ocrTextToPaste);

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("#installBtn").hidden=false});
$("#installBtn").addEventListener("click",async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("#installBtn").hidden=true});
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
initTabs();
(async()=>{await loadFromSupabase();refreshAll();})();