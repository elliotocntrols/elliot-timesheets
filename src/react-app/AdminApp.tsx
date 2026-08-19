import {useEffect,useMemo,useState} from 'react';
import ExcelJS from 'exceljs';
import {api,Entry,JobOption,setManifest,StaffRow,User} from './appShared';

type Tab='dashboard'|'live'|'qa'|'payroll'|'staff'|'jobqr'|'integrations';
type SimproPreview={ready:boolean;message:string;employeeName:string;employeeId:string;jobName?:string;jobId:string|number;date:string;start:string;finish:string;totalHours:number;duplicate?:boolean};
type AdminEntry=Entry&{pmApprovedBy?:string;adminApprovedBy?:string;simproPreview?:SimproPreview};
type ClockSession={id:string;employeeId:string;employee:string;jobNumber:string;jobName:string;date:string;startLocal:string;startedAt:string;status:'active'|'closed'};
type QaItem={key:string;label:string;result:'Pending'|'Pass'|'Fail'|'N/A';notes:string;reading:string;photoIds:string[];defectOpen?:boolean};
type QaInspection={id:string;jobNumber:string;discipline:'BMS'|'Electrical';templateName:string;area:string;assetTag:string;title:string;createdBy:string;createdAt:string;updatedAt:string;items:QaItem[]};

export default function AdminApp(){
 const[user,setUser]=useState<User|null>(null);
 const[entries,setEntries]=useState<AdminEntry[]>([]);
 const[staff,setStaff]=useState<StaffRow[]>([]);
 const[loading,setLoading]=useState(true);
 const[message,setMessage]=useState('');
 const[tab,setTab]=useState<Tab>('dashboard');
 const[offset,setOffset]=useState(0);
 const[search,setSearch]=useState('');
 const[staffSearch,setStaffSearch]=useState('');
 const[editingEntry,setEditingEntry]=useState<AdminEntry|null>(null);
 const[editForm,setEditForm]=useState({date:'',type:'Work',jobNumber:'',start:'07:00',finish:'15:30',notes:''});
 const[openPeople,setOpenPeople]=useState<Record<string,boolean>>({});
 const[temporary,setTemporary]=useState<{name:string;password:string}|null>(null);
 const[busyId,setBusyId]=useState('');
 const[jobs,setJobs]=useState<JobOption[]>([]);
 const[jobsLoading,setJobsLoading]=useState(false);
 const[jobQrSearch,setJobQrSearch]=useState('');
 const[selectedJob,setSelectedJob]=useState<JobOption|null>(null);
 const[liveClocks,setLiveClocks]=useState<ClockSession[]>([]);
 const[qaInspections,setQaInspections]=useState<QaInspection[]>([]);
 const[qaFilter,setQaFilter]=useState<'all'|'BMS'|'Electrical'|'defects'>('all');

 useEffect(()=>{setManifest(true);void load()},[]);
 useEffect(()=>{if((tab==='jobqr'||tab==='qa')&&user?.role==='admin'&&!jobs.length)void loadJobs()},[tab,user?.role]);
 useEffect(()=>{if(tab==='live')void loadLive();if(tab==='qa')void loadQaAdmin()},[tab]);
 useEffect(()=>{if(tab!=='live')return;const i=setInterval(()=>void loadLive(),30000);return()=>clearInterval(i)},[tab]);


 async function loadLive(){try{const d=await api<{clocks:ClockSession[]}>('/api/clock/live');setLiveClocks(d.clocks||[])}catch(e){setMessage(e instanceof Error?e.message:'Could not load live workforce')}}
 async function loadQaAdmin(){try{const d=await api<{inspections:QaInspection[]}>('/api/qa/inspections?all=1');setQaInspections(d.inspections||[])}catch(e){setMessage(e instanceof Error?e.message:'Could not load QA')}}
 function clockElapsed(startedAt:string){const ms=Math.max(0,Date.now()-new Date(startedAt).getTime()),h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);return `${h}h ${String(m).padStart(2,'0')}m`}

 async function loadJobs(){
  setJobsLoading(true);setMessage('');
  try{const d=await api<{jobs:JobOption[]}>('/api/simpro-jobs');setJobs(d.jobs||[])}
  catch(e){setMessage(e instanceof Error?e.message:'Could not load Simpro jobs')}
  finally{setJobsLoading(false)}
 }

 function qrUrlFor(job:JobOption){return `${window.location.origin}/?job=${encodeURIComponent(String(job.id))}`}
 function qrImageFor(job:JobOption){return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=16&data=${encodeURIComponent(qrUrlFor(job))}`}
 function printJobQr(job:JobOption){
  const w=window.open('','_blank','noopener,noreferrer,width=760,height=900');
  if(!w){setMessage('Allow pop-ups for this site so the QR sign can open for printing.');return}
  const title=(job.name||job.site||`Job ${job.id}`).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]||c));
  const site=(job.site||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]||c));
  w.document.write(`<!doctype html><html><head><title>Job ${job.id} QR</title><style>body{font-family:Arial,sans-serif;margin:0;padding:42px;text-align:center;color:#10202d}.brand{font-size:15px;font-weight:800;letter-spacing:.14em;color:#f4a900}.card{max-width:620px;margin:auto;border:3px solid #10202d;border-radius:26px;padding:36px}h1{font-size:34px;margin:10px 0}.job{font-size:22px;font-weight:800}.site{font-size:18px;margin:8px 0 24px;color:#52616c}img{width:390px;max-width:85%;height:auto}.scan{font-size:28px;font-weight:900;margin:22px 0 8px}.small{font-size:15px;color:#52616c}.no-print{margin-top:24px}@media print{.no-print{display:none}body{padding:0}.card{border-width:2px}}</style></head><body><div class="card"><div class="brand">ELLIOT CONTROLS</div><h1>SCAN TO CLOCK ON</h1><div class="job">Job ${job.id} — ${title}</div><div class="site">${site}</div><img src="${qrImageFor(job)}" alt="Job QR"><div class="scan">Scan with your phone camera</div><div class="small">Sign in with your own Timesheets account. This QR selects this job automatically.</div></div><button class="no-print" onclick="window.print()">Print this sign</button></body></html>`);
  w.document.close();
 }

 async function load(){
  setLoading(true);
  try{
   const m=await api<{user:User}>('/api/auth/me');
   setUser(m.user);
   if(m.user.role!=='admin')return;
   const[t,s]=await Promise.all([
    api<{entries:AdminEntry[]}>('/api/timesheets'),
    api<{staff:StaffRow[]}>('/api/admin/staff')
   ]);
   setEntries(t.entries);
   setStaff(s.staff);
  }catch{
   setUser(null);
  }finally{
   setLoading(false);
  }
 }

 async function reviewDay(id:string,action:'admin-approve'|'reject'){
  let reason='';
  if(action==='reject')reason=prompt('Reason for rejecting this day?')||'Rejected';
  setBusyId(id);setMessage('');
  try{
   await api(`/api/timesheets/${id}`,{method:'PATCH',body:JSON.stringify({action,reason})});
   setMessage(action==='admin-approve'?'Day approved for payroll. Simpro Safe Mode checked automatically.':'Day rejected.');
   await load();
  }catch(e){setMessage(e instanceof Error?e.message:'Could not update day')}
  finally{setBusyId('')}
 }

 function beginAdminEdit(entry:AdminEntry){
  setEditingEntry(entry);
  setEditForm({date:entry.date,type:entry.type,jobNumber:entry.jobNumber||'',start:entry.start,finish:entry.finish,notes:entry.notes||''});
 }

 function adminHours(){
  if(!editForm.start||!editForm.finish)return 0;
  const[sh,sm]=editForm.start.split(':').map(Number),[fh,fm]=editForm.finish.split(':').map(Number);
  let mins=fh*60+fm-(sh*60+sm);if(mins<0)mins+=1440;
  return Math.max(0,Math.round(mins/60*100)/100);
 }

 async function saveAdminEdit(){
  if(!editingEntry)return;
  const totalHours=adminHours();
  if(editForm.type==='Work'&&!editForm.jobNumber.trim())return setMessage('Job number is required for worked time.');
  if(totalHours<=0)return setMessage('Check start and finish times.');
  setBusyId(editingEntry.id);setMessage('');
  try{
   await api(`/api/timesheets/${editingEntry.id}`,{method:'PATCH',body:JSON.stringify({action:'edit',...editForm,breakMinutes:0,totalHours})});
   setMessage(editingEntry.status==='Admin Approved'?'Approved day updated and Simpro Safe Mode re-checked.':'Day updated. It is waiting for approval.');
   setEditingEntry(null);
   await load();
  }catch(e){setMessage(e instanceof Error?e.message:'Could not edit day')}
  finally{setBusyId('')}
 }

 async function recheckSimpro(id:string){
  setBusyId(id);setMessage('');
  try{
   const data=await api<{entry:AdminEntry}>(`/api/timesheets/${id}/simpro-preview`,{method:'POST'});
   setMessage(data.entry.simproPreview?.ready?'Simpro Safe Mode passed. Nothing was written to Simpro.':data.entry.simproPreview?.message||'Simpro Safe Mode check completed.');
   await load();
  }catch(e){setMessage(e instanceof Error?e.message:'Could not re-check Simpro')}
  finally{setBusyId('')}
 }

 async function staffAction(id:string,action:'activate'|'reset-password'|'deactivate'){
  setMessage('');setTemporary(null);setBusyId(id);
  try{
   const d=await api<{tempPassword?:string;employee?:{name:string}}>(`/api/admin/staff/${id}/${action}`,{method:'POST'});
   if(d.tempPassword&&d.employee)setTemporary({name:d.employee.name,password:d.tempPassword});
   setMessage(action==='deactivate'?'Account deactivated.':action==='activate'?'Account activated. Give the temporary password to the employee.':'Temporary password reset.');
   await load();
  }catch(e){setMessage(e instanceof Error?e.message:'Could not update staff')}
  finally{setBusyId('')}
 }

 async function setRole(id:string,role:'staff'|'pm'|'admin'){
  setBusyId(id);setMessage('');
  try{await api(`/api/admin/staff/${id}/role`,{method:'PATCH',body:JSON.stringify({role})});setMessage('Staff role updated.');await load()}
  catch(e){setMessage(e instanceof Error?e.message:'Could not update role')}
  finally{setBusyId('')}
 }

 async function setPattern(id:string,days:number[]){
  setBusyId(id);setMessage('');
  try{await api(`/api/admin/staff/${id}/work-pattern`,{method:'PATCH',body:JSON.stringify({days})});setStaff(x=>x.map(s=>s.employeeId===id?{...s,workDays:days}:s));setMessage('Expected workdays updated.')}
  catch(e){setMessage(e instanceof Error?e.message:'Could not update work pattern')}
  finally{setBusyId('')}
 }

 async function logout(){await api('/api/auth/logout',{method:'POST'});location.href='/'}

 const week=useMemo(()=>{
  const n=new Date(),s=new Date(n);
  s.setDate(n.getDate()-((n.getDay()-3+7)%7)+offset*7);s.setHours(0,0,0,0);
  const days=Array.from({length:7},(_,i)=>{const d=new Date(s);d.setDate(s.getDate()+i);return d});
  const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const es=entries.filter(e=>{const d=new Date(`${e.date}T00:00:00`);return d>=days[0]&&d<=new Date(days[6].getTime()+86399999)});
  return{days,iso,entries:es,label:`${days[0].toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${days[6].toLocaleDateString('en-AU',{day:'numeric',month:'short'})}`};
 },[entries,offset]);

 const active=staff.filter(s=>s.active);
 const waiting=week.entries.filter(e=>e.status==='Submitted'||e.status==='PM Approved');
 const approved=week.entries.filter(e=>e.status==='Admin Approved');
 const rejected=week.entries.filter(e=>e.status==='Rejected');
 const pendingPeople=Array.from(new Set(waiting.map(e=>e.employeeId))).length;
 const approvedPeople=Array.from(new Set(approved.map(e=>e.employeeId))).length;
 const simproReady=approved.filter(e=>e.simproPreview?.ready).length;
 const simproBlocked=approved.filter(e=>e.simproPreview&&!e.simproPreview.ready).length;

 const reviewPeople=Array.from(new Map<string,string>(week.entries.map(e=>[e.employeeId,e.employee] as [string,string])).entries())
  .map(([employeeId,employee])=>{
   const es=week.entries.filter(e=>e.employeeId===employeeId).sort((a,b)=>a.date.localeCompare(b.date));
   return{employeeId,employee,entries:es,total:es.reduce((a,e)=>a+e.totalHours,0),pending:es.filter(e=>e.status==='Submitted'||e.status==='PM Approved').length,rejected:es.filter(e=>e.status==='Rejected').length,approved:es.filter(e=>e.status==='Admin Approved').length};
  })
  .sort((a,b)=>b.pending-a.pending||b.rejected-a.rejected||a.employee.localeCompare(b.employee));

 const payroll=active.map(s=>{
  const es=week.entries.filter(e=>e.employeeId===s.employeeId);
  const approvedEs=es.filter(e=>e.status==='Admin Approved');
  const sum=(rows:AdminEntry[],t:string)=>rows.filter(e=>e.type===t).reduce((a,e)=>a+e.totalHours,0);
  const statusHours=(status:Entry['status'])=>es.filter(e=>e.status===status).reduce((a,e)=>a+e.totalHours,0);
  return{s,work:sum(es,'Work'),rdo:sum(es,'RDO'),sick:sum(es,'Sick Leave'),annual:sum(es,'Annual Leave'),ph:sum(es,'Public Holiday'),training:sum(es,'Training'),total:es.reduce((a,e)=>a+e.totalHours,0),pending:statusHours('Submitted')+statusHours('PM Approved'),approved:statusHours('Admin Approved'),rejected:statusHours('Rejected'),approvedTotal:approvedEs.reduce((a,e)=>a+e.totalHours,0)};
 }).filter(r=>!search||`${r.s.name} ${r.s.position}`.toLowerCase().includes(search.toLowerCase()));

 const approvedPayroll=payroll.map(r=>({...r,
  work:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Work').reduce((a,e)=>a+e.totalHours,0),
  rdo:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='RDO').reduce((a,e)=>a+e.totalHours,0),
  sick:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Sick Leave').reduce((a,e)=>a+e.totalHours,0),
  annual:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Annual Leave').reduce((a,e)=>a+e.totalHours,0),
  ph:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Public Holiday').reduce((a,e)=>a+e.totalHours,0),
  training:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Training').reduce((a,e)=>a+e.totalHours,0),
  total:r.approvedTotal
 }));

 const filteredStaff=staff.filter(s=>!staffSearch||`${s.name} ${s.email} ${s.position} ${s.employeeId}`.toLowerCase().includes(staffSearch.toLowerCase()));

 function exportCsv(){
  const rows=[['Employee ID','Employee','Work','RDO','Sick','Annual Leave','Public Holiday','Training','Total'],...approvedPayroll.map(r=>[r.s.employeeId,r.s.name,r.work,r.rdo,r.sick,r.annual,r.ph,r.training,r.total])];
  const csv=rows.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const u=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');
  a.href=u;a.download=`Elliot-Payroll-${week.iso(week.days[0])}.csv`;a.click();URL.revokeObjectURL(u);
 }

 async function generateWages(){
  setMessage('');
  const blockers=week.entries.filter(e=>e.status!=='Admin Approved');
  if(blockers.length&&!confirm(`${blockers.length} timesheet entr${blockers.length===1?'y is':'ies are'} not approved for payroll. Generate the wage workbook using approved entries only?`))return;
  try{
   const response=await fetch('/wage-template.xlsx',{cache:'no-store'});
   if(!response.ok)throw new Error('Wage template could not be loaded. Check public/wage-template.xlsx.');
   const template=await response.arrayBuffer();
   const workbook=new ExcelJS.Workbook();
   await workbook.xlsx.load(template);
   const sheet=workbook.getWorksheet('App Import');
   if(!sheet)throw new Error('The wage template is missing the App Import sheet.');
   const start=week.days[0];
   sheet.getCell('B2').value=new Date(start.getFullYear(),start.getMonth(),start.getDate());
   sheet.getCell('B2').numFmt='dd/mm/yyyy';
   for(let row=5;row<=2004;row++)for(let col=1;col<=7;col++)sheet.getCell(row,col).value=null;
   const approvedEntries=week.entries.filter(e=>e.status==='Admin Approved').sort((a,b)=>a.date.localeCompare(b.date)||a.employee.localeCompare(b.employee));
   approvedEntries.forEach((e,i)=>{
    const row=5+i,[y,m,d]=e.date.split('-').map(Number);
    sheet.getCell(row,1).value=e.employeeId;sheet.getCell(row,2).value=e.employee;sheet.getCell(row,3).value=new Date(y,m-1,d);sheet.getCell(row,3).numFmt='dd/mm/yyyy';sheet.getCell(row,4).value=e.type;sheet.getCell(row,5).value=e.jobNumber||'';sheet.getCell(row,6).value=e.totalHours;sheet.getCell(row,6).numFmt='0.00';sheet.getCell(row,7).value='Admin Approved';
   });
   workbook.calcProperties.fullCalcOnLoad=true;
   const output=await workbook.xlsx.writeBuffer();
   const blob=new Blob([output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=`Wages_${week.iso(week.days[0])}_to_${week.iso(week.days[6])}.xlsx`;a.click();URL.revokeObjectURL(url);
   setMessage(`Wage workbook generated with ${approvedEntries.length} approved timesheet entr${approvedEntries.length===1?'y':'ies'}.`);
  }catch(e){setMessage(e instanceof Error?e.message:'Could not generate wage workbook')}
 }

 if(loading)return <div className="gate">Loading Office Admin…</div>;
 if(!user)return <div className="gate"><h1>Office Admin</h1><a href="/">Sign in through Timesheets</a></div>;
 if(user.role!=='admin')return <div className="gate"><h1>Office Admin only</h1><a href="/">Back to Timesheets</a></div>;

 return <div className="admin">
  <aside>
   <div className="brand"><span>EC</span><div><b>Elliot Controls</b><small>Office Admin</small></div></div>
   <nav>{(['dashboard','live','qa','payroll','staff','jobqr','integrations'] as Tab[]).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t==='jobqr'?'Job QR Codes':t==='live'?'Live Team':t==='qa'?'QA / Defects':t[0].toUpperCase()+t.slice(1)}</button>)}</nav>
   <div className="bottom"><a href="/">Worker App</a><button onClick={logout}>Sign out</button></div>
  </aside>
  <main>
   <header className="admintop"><div><span>OFFICE ADMIN</span><h1>{tab==='jobqr'?'Job QR Codes':tab==='live'?'Live Workforce':tab==='qa'?'QA / Defects':tab[0].toUpperCase()+tab.slice(1)}</h1></div><div className="weeks"><button onClick={()=>setOffset(v=>v-1)}>←</button><b>{week.label}</b><button onClick={()=>setOffset(v=>v+1)}>→</button></div></header>
   {message&&<div className="message">{message}</div>}

   {tab==='dashboard'&&<>
    <section className="metrics"><Metric l="Active staff" v={active.length}/><Metric l="Approved people" v={approvedPeople}/><Metric l="Awaiting approval" v={pendingPeople}/><Metric l="Needs attention" v={new Set(rejected.map(e=>e.employeeId)).size}/></section>
    <section className="panel">
     <div className="panelhead"><div><span>WEEK REVIEW</span><h2>{reviewPeople.length?`${reviewPeople.length} ${reviewPeople.length===1?'person':'people'}`:'No entries'}</h2><p className="payroll-note">Employees are minimised by default. Click a name to review, edit, approve or reject each day.</p></div><button onClick={load}>Refresh</button></div>
     {reviewPeople.length===0?<p className="muted">No timesheets for this week.</p>:reviewPeople.map(g=>{
      const open=!!openPeople[g.employeeId];
      return <div className={`person-approval ${open?'open':''}`} key={g.employeeId}>
       <div className="person-approval-head" role="button" tabIndex={0} aria-expanded={open} onClick={()=>setOpenPeople(v=>({...v,[g.employeeId]:!open}))} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpenPeople(v=>({...v,[g.employeeId]:!open}))}}}>
        <div className="person-approval-toggle"><span className="person-approval-chevron">▶</span><div><b>{g.employee}</b><span>{g.entries.length} entr{g.entries.length===1?'y':'ies'} • {week.label}</span></div></div>
        <span className={`person-approval-summary ${g.rejected?'attention':''}`}>{g.total.toFixed(2)} hrs • {g.pending} awaiting{g.rejected?` • ${g.rejected} rejected`:''}</span>
       </div>
       <div className="approval-days daily-admin-days">{g.entries.map(e=><div className="admin-day-card" key={e.id}>
        <div className="admin-day-main"><b>{new Date(`${e.date}T00:00:00`).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</b><span>{e.type} • {e.totalHours.toFixed(2)} hrs {e.jobNumber?`• Job ${e.jobNumber}`:''}</span><small className={`day-status ${e.status.toLowerCase().replace(/ /g,'-')}`}>{e.status==='Admin Approved'?'Approved for Payroll':e.status}</small>{e.rejectionReason&&<small className="day-reason">Rejected: {e.rejectionReason}</small>}</div>
        <div className="admin-day-actions"><button disabled={busyId===e.id} onClick={()=>beginAdminEdit(e)}>Edit</button>{(e.status==='Submitted'||e.status==='PM Approved')&&<><button className="primary" disabled={busyId===e.id} onClick={()=>reviewDay(e.id,'admin-approve')}>{busyId===e.id?'Working…':'Approve'}</button><button className="danger" disabled={busyId===e.id} onClick={()=>reviewDay(e.id,'reject')}>Reject</button></>}{e.status==='Admin Approved'&&<button disabled={busyId===e.id} onClick={()=>recheckSimpro(e.id)}>Re-check Simpro</button>}</div>
        {e.status==='Admin Approved'&&<SimproSafe entry={e} onRecheck={()=>recheckSimpro(e.id)} busy={busyId===e.id}/>} 
       </div>)}</div>
      </div>;
     })}
    </section>
   </>}


   {tab==='live'&&<>
    <section className="metrics"><Metric l="Clocked on now" v={liveClocks.length}/><Metric l="Projects active" v={new Set(liveClocks.map(c=>c.jobNumber)).size}/><Metric l="Staff accounts" v={active.length}/><Metric l="Awaiting approval" v={pendingPeople}/></section>
    <section className="panel live-workforce-panel"><div className="panelhead"><div><span>LIVE WORKFORCE</span><h2>Who's on site now</h2><p className="payroll-note">Updates every 30 seconds. Workers clock on from the project QR or job search.</p></div><button onClick={loadLive}>Refresh</button></div>{liveClocks.length===0?<div className="empty-team"><b>No one is clocked on right now.</b><span>When a worker clocks on, they will appear here immediately.</span></div>:<div className="live-workforce-grid">{liveClocks.map(c=><div className="live-person-card" key={c.id}><div className="live-dot"></div><div><b>{c.employee}</b><span>Job #{c.jobNumber} — {c.jobName}</span><small>Started {c.startLocal} • {c.date}</small></div><strong>{clockElapsed(c.startedAt)}</strong></div>)}</div>}</section>
   </>}

   {tab==='qa'&&<section className="panel qa-admin-panel"><div className="panelhead"><div><span>QA / COMMISSIONING</span><h2>Project quality dashboard</h2><p className="payroll-note">BMS and Electrical installed-item QA, evidence photos and open defects.</p></div><button onClick={loadQaAdmin}>Refresh</button></div>
    <div className="qa-admin-metrics"><div><span>QA items</span><b>{qaInspections.length}</b></div><div><span>BMS</span><b>{qaInspections.filter(x=>x.discipline==='BMS').length}</b></div><div><span>Electrical</span><b>{qaInspections.filter(x=>x.discipline==='Electrical').length}</b></div><div className="attention"><span>Open defects</span><b>{qaInspections.reduce((a,x)=>a+x.items.filter(i=>i.defectOpen).length,0)}</b></div></div>
    <div className="qa-admin-filters"><button className={qaFilter==='all'?'active':''} onClick={()=>setQaFilter('all')}>All</button><button className={qaFilter==='BMS'?'active':''} onClick={()=>setQaFilter('BMS')}>BMS</button><button className={qaFilter==='Electrical'?'active':''} onClick={()=>setQaFilter('Electrical')}>Electrical</button><button className={qaFilter==='defects'?'active':''} onClick={()=>setQaFilter('defects')}>Open defects</button></div>
    <div className="qa-admin-list">{qaInspections.filter(x=>qaFilter==='all'||qaFilter===x.discipline||(qaFilter==='defects'&&x.items.some(i=>i.defectOpen))).map(ins=>{const done=ins.items.filter(i=>i.result!=='Pending').length,pass=ins.items.filter(i=>i.result==='Pass').length,defects=ins.items.filter(i=>i.defectOpen).length,photos=ins.items.reduce((a,i)=>a+i.photoIds.length,0),pct=Math.round(done/Math.max(1,ins.items.length)*100);return <article className="qa-admin-card" key={ins.id}><div className="qa-admin-card-head"><div><span>{ins.discipline} • Job #{ins.jobNumber} • {ins.area||'No area'}</span><b>{ins.assetTag||ins.title||ins.templateName}</b><small>{ins.templateName} • by {ins.createdBy}</small></div><div><strong>{pct}%</strong><span>{pass} pass • {photos} photos</span></div></div><div className="qa-progress"><i style={{width:`${pct}%`}}></i></div>{defects>0&&<div className="qa-defect-banner">⚠ {defects} open defect{defects===1?'':'s'}</div>}<div className="qa-admin-items">{ins.items.filter(i=>i.result!=='Pending'||i.defectOpen).slice(0,8).map(i=><div key={i.key}><span className={`qa-mini-result ${i.result.toLowerCase().replace('/','')}`}>{i.result}</span><b>{i.label}</b>{i.reading&&<small>{i.reading}</small>}{i.photoIds.length>0&&<div className="qa-admin-photos">{i.photoIds.slice(0,4).map(id=><a href={`/api/qa/photos/${id}`} target="_blank" rel="noreferrer" key={id}><img src={`/api/qa/photos/${id}`} alt="QA evidence"/></a>)}</div>}</div>)}</div><a className="qa-open-job" href={`/?job=${encodeURIComponent(ins.jobNumber)}`}>Open project in Team App →</a></article>})}</div>
   </section>}

   {tab==='payroll'&&<>
    <section className="payhero"><div><span>WEDNESDAY → TUESDAY</span><h2>Payroll Preview</h2><p>All entered time appears immediately. Only Approved for Payroll hours are exported to Wages.xlsx.</p></div><div className="payroll-actions"><button className="primary" onClick={generateWages}>Generate Wages.xlsx</button><button className="secondary-dark" onClick={exportCsv}>Export Approved CSV</button></div></section>
    <section className="payroll-status-cards"><div><span>Awaiting approval</span><b>{waiting.reduce((a,e)=>a+e.totalHours,0).toFixed(2)} hrs</b></div><div><span>Total entered</span><b>{week.entries.reduce((a,e)=>a+e.totalHours,0).toFixed(2)} hrs</b></div><div className="approved-card"><span>Approved for Payroll</span><b>{approved.reduce((a,e)=>a+e.totalHours,0).toFixed(2)} hrs</b></div><div className="rejected-card"><span>Rejected</span><b>{rejected.reduce((a,e)=>a+e.totalHours,0).toFixed(2)} hrs</b></div></section>
    <section className="panel"><div className="panelhead"><div><h2>{week.label}</h2><p className="payroll-note">Use this screen to confirm entered versus approved hours before generating wages.</p></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee"/></div><div className="tablewrap"><table><thead><tr><th>Employee</th><th>Work</th><th>RDO</th><th>Sick</th><th>Annual</th><th>P/Hol</th><th>Training</th><th>Total Entered</th><th>Awaiting</th><th>Approved</th><th>Rejected</th></tr></thead><tbody>{payroll.map(r=><tr key={r.s.employeeId}><td><b>{r.s.name}</b><small>{r.s.position}</small></td><td>{r.work.toFixed(2)}</td><td>{r.rdo.toFixed(2)}</td><td>{r.sick.toFixed(2)}</td><td>{r.annual.toFixed(2)}</td><td>{r.ph.toFixed(2)}</td><td>{r.training.toFixed(2)}</td><td><b>{r.total.toFixed(2)}</b></td><td><span className="status-hours pending">{r.pending.toFixed(2)}</span></td><td><span className="status-hours approved">{r.approved.toFixed(2)}</span></td><td><span className="status-hours rejected">{r.rejected.toFixed(2)}</span></td></tr>)}</tbody></table></div></section>
   </>}

   {tab==='staff'&&<section className="panel">
    <div className="panelhead"><div><h2>Accounts & work patterns</h2><p className="payroll-note">Activate accounts, reset passwords, assign roles and set each employee's expected workdays.</p></div><button onClick={load}>Refresh</button></div>
    <input className="staff-search" value={staffSearch} onChange={e=>setStaffSearch(e.target.value)} placeholder="Search name, email, employee ID or position"/>
    {temporary&&<div className="temporary"><div><strong>Temporary password for {temporary.name}</strong><code>{temporary.password}</code><span>Copy this now and give it to the employee.</span></div><button onClick={()=>navigator.clipboard?.writeText(temporary.password)}>Copy</button></div>}
    <div className="staff-list">{filteredStaff.map(s=>{const days=s.workDays||[3,4,5,1,2],opts:[string,number][]=[['Wed',3],['Thu',4],['Fri',5],['Sat',6],['Sun',0],['Mon',1],['Tue',2]];return <div className="staffrow" key={s.employeeId}><div><b>{s.name}</b><span>{s.position||'No position'} • Simpro #{s.employeeId}</span><span>{s.email}</span><div className="daypills">{opts.map(([l,n])=>{const on=days.includes(n);return <button key={l} className={on?'active':''} disabled={busyId===s.employeeId} onClick={()=>setPattern(s.employeeId,on?days.filter(d=>d!==n):[...days,n].sort((a,b)=>a-b))}>{l}</button>})}</div></div><div><select value={s.role} disabled={busyId===s.employeeId} onChange={e=>setRole(s.employeeId,e.target.value as 'staff'|'pm'|'admin')}><option value="staff">Staff</option><option value="pm">Project Manager</option><option value="admin">Office Admin</option></select><span className={`account-status ${s.active?'active':'inactive'}`}>{s.active?(s.mustChangePassword?'Temp password issued':'Active'):'Not activated'}</span>{s.active?<><button disabled={busyId===s.employeeId} onClick={()=>staffAction(s.employeeId,'reset-password')}>Reset password</button><button className="danger" disabled={busyId===s.employeeId} onClick={()=>staffAction(s.employeeId,'deactivate')}>Deactivate</button></>:<button className="primary" disabled={busyId===s.employeeId} onClick={()=>staffAction(s.employeeId,'activate')}>Activate</button>}</div></div>})}</div>
   </section>}

   {tab==='jobqr'&&<section className="panel job-qr-panel">
    <div className="panelhead"><div><span>JOB SITE QR CODES</span><h2>Print a QR for each Simpro job</h2><p className="payroll-note">Workers scan the QR at site, sign in as themselves, and the correct Simpro job is selected automatically.</p></div><button onClick={loadJobs} disabled={jobsLoading}>{jobsLoading?'Loading…':'Refresh jobs'}</button></div>
    <div className="job-qr-layout">
     <div className="job-qr-browser"><input value={jobQrSearch} onChange={e=>setJobQrSearch(e.target.value)} placeholder="Search job number, name, site or customer"/>
      <div className="job-qr-list">{jobsLoading?<p className="muted">Loading Simpro jobs…</p>:jobs.filter(j=>!jobQrSearch||`${j.id} ${j.name} ${j.site} ${j.customer}`.toLowerCase().includes(jobQrSearch.toLowerCase())).slice(0,80).map(j=><button key={j.id} className={selectedJob?.id===j.id?'active':''} onClick={()=>setSelectedJob(j)}><b>{j.name||j.site||`Job ${j.id}`}</b><span>#{j.id}{j.site?` • ${j.site}`:''}{j.customer?` • ${j.customer}`:''}</span></button>)}</div>
     </div>
     <div className="job-qr-preview">{selectedJob?<><span className="eyebrow">PRINT PREVIEW</span><h2>{selectedJob.name||selectedJob.site||`Job ${selectedJob.id}`}</h2><p>Job #{selectedJob.id}{selectedJob.site?` • ${selectedJob.site}`:''}</p><div className="qr-image-frame"><img src={qrImageFor(selectedJob)} alt={`QR code for job ${selectedJob.id}`}/></div><code className="qr-link">{qrUrlFor(selectedJob)}</code><div className="job-qr-actions"><button className="primary" onClick={()=>printJobQr(selectedJob)}>Print job-site QR</button><button onClick={()=>navigator.clipboard?.writeText(qrUrlFor(selectedJob))}>Copy link</button></div><small>Workers still use their own login. The QR only selects the job; it does not identify the employee.</small></>:<div className="job-qr-empty"><b>Select a Simpro job</b><span>Its printable QR sign will appear here.</span></div>}</div>
    </div>
   </section>}

   {tab==='integrations'&&<section className="integrations restored-integrations">
    <Card t="Simpro" s="Connected" d="Job lookup is connected. Approved timesheets run Safe Mode verification before any future live posting." good/>
    <Card t="Safe Mode" s={simproBlocked?`${simproBlocked} blocked`:simproReady?`${simproReady} ready`:'Waiting'} d={`${simproReady} approved entr${simproReady===1?'y':'ies'} ready; ${simproBlocked} blocked in the selected week.`} good={simproReady>0&&simproBlocked===0}/>
    <Card t="MYOB" s="Not connected" d="Reserved for MYOB OAuth/API integration after payroll workflow is signed off."/>
    <Card t="Payroll spreadsheet" s="Ready" d="Generate Wages.xlsx from approved Wednesday→Tuesday entries." good/>
    <div className="icard integration-wide"><div><b>Payroll controls</b><span className="good">Available</span></div><p>Open Payroll to review entered/approved hours, export CSV, or generate the wage workbook.</p><button className="primary" onClick={()=>setTab('payroll')}>Open Payroll</button></div>
   </section>}

   {editingEntry&&<div className="admin-edit-backdrop" onClick={()=>setEditingEntry(null)}><div className="admin-edit-modal" onClick={e=>e.stopPropagation()}><div className="admin-edit-head"><div><span>EDIT DAY</span><h2>{editingEntry.employee}</h2><p>{new Date(`${editingEntry.date}T00:00:00`).toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}</p></div><button onClick={()=>setEditingEntry(null)}>×</button></div><div className="admin-edit-grid"><label>Date<input type="date" value={editForm.date} onChange={e=>setEditForm({...editForm,date:e.target.value})}/></label><label>Type<select value={editForm.type} onChange={e=>setEditForm({...editForm,type:e.target.value,jobNumber:e.target.value==='Work'?editForm.jobNumber:''})}><option>Work</option><option>Annual Leave</option><option>Sick Leave</option><option>RDO</option><option>Public Holiday</option><option>Training</option><option>Other Paid Leave</option></select></label>{editForm.type==='Work'&&<label className="wide">Job number<input value={editForm.jobNumber} onChange={e=>setEditForm({...editForm,jobNumber:e.target.value})}/></label>}<label>Start<input type="time" value={editForm.start} onChange={e=>setEditForm({...editForm,start:e.target.value})}/></label><label>Finish<input type="time" value={editForm.finish} onChange={e=>setEditForm({...editForm,finish:e.target.value})}/></label><label className="wide">Notes<input value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/></label></div><div className="admin-edit-footer"><span>{adminHours().toFixed(2)} hrs</span><div><button onClick={()=>setEditingEntry(null)}>Cancel</button><button className="primary" disabled={busyId===editingEntry.id} onClick={saveAdminEdit}>{busyId===editingEntry.id?'Saving…':'Save day'}</button></div></div></div></div>}
  </main>
 </div>;
}

function SimproSafe({entry,onRecheck,busy}:{entry:AdminEntry;onRecheck:()=>void;busy:boolean}){
 const p=entry.simproPreview;
 return <div className={`simpro-safe ${p?.ready?'ready':'blocked'}`}><div className="simpro-safe-head"><strong>{p?.ready?'Simpro Safe Mode ✓':'Simpro Safe Mode'}</strong><span>{entry.simproStatus||'Not checked'}</span></div>{p?<><p>{p.message}</p><div className="simpro-preview-grid"><span><small>Employee</small>{p.employeeName} #{p.employeeId}</span><span><small>Job</small>{p.jobName||`#${p.jobId}`}</span><span><small>Date</small>{p.date}</span><span><small>Time</small>{p.start}–{p.finish} • {p.totalHours.toFixed(2)}h</span></div>{p.duplicate&&<strong className="duplicate-warning">Possible duplicate detected</strong>}<button type="button" className="simpro-recheck" disabled={busy} onClick={onRecheck}>{busy?'Checking…':'Re-check Simpro'}</button></>:<><p>Approved for payroll. Run the Safe Mode check to verify the employee/job/date before live Simpro posting is ever enabled.</p><button type="button" className="simpro-recheck" disabled={busy} onClick={onRecheck}>{busy?'Checking…':'Run Safe Mode check'}</button></>}</div>;
}

function Metric({l,v}:{l:string;v:number}){return <div className="metric"><span>{l}</span><b>{v}</b></div>}
function Card({t,s,d,good}:{t:string;s:string;d:string;good?:boolean}){return <div className="icard"><div><b>{t}</b><span className={good?'good':''}>{s}</span></div><p>{d}</p></div>}
