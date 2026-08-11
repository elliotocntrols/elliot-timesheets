import { FormEvent, InputHTMLAttributes, useEffect, useMemo, useState } from 'react';
import './App.css';

type Role='staff'|'pm'|'admin';
type WorkType='Work'|'Annual Leave'|'Sick Leave'|'RDO'|'Public Holiday'|'Training'|'Other Paid Leave';
type Status='Submitted'|'PM Approved'|'Admin Approved'|'Rejected';
type User={employeeId:string;name:string;email:string;role:Role;position:string;mustChangePassword:boolean};
type StaffRow={employeeId:string;name:string;email:string;position:string;role:Role;active:boolean;mustChangePassword:boolean};
type JobOption={id:number;name:string;site:string;customer:string};
type Entry={id:string;employeeId:string;employee:string;date:string;type:WorkType;jobNumber:string;start:string;finish:string;breakMinutes:number;totalHours:number;notes:string;status:Status;pmApprovedBy?:string;adminApprovedBy?:string;rejectionReason?:string;createdAt:string;simproStatus?:string};

const workTypes:WorkType[]=['Work','Annual Leave','Sick Leave','RDO','Public Holiday','Training','Other Paid Leave'];

function hoursBetween(start:string,finish:string,breakMinutes:number){
 if(!start||!finish)return 0;
 const[sh,sm]=start.split(':').map(Number),[fh,fm]=finish.split(':').map(Number);
 let mins=fh*60+fm-(sh*60+sm)-breakMinutes;
 if(mins<0)mins+=1440;
 return Math.max(0,Math.round(mins/60*100)/100);
}
function roleLabel(role:Role){return role==='pm'?'Project Manager':role==='admin'?'Office Admin':'Staff'}
function statusClass(status:string){return status.toLowerCase().replace(/ /g,'-')}
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const res=await fetch(path,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...(init?.headers||{})}});
 const text=await res.text();
 if(!res.ok){let msg=text||'Request failed';try{msg=JSON.parse(text).error||msg}catch{}throw new Error(msg)}
 return(text?JSON.parse(text):{}) as T;
}

export default function App(){
 const[user,setUser]=useState<User|null>(null),[entries,setEntries]=useState<Entry[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 const[login,setLogin]=useState({identifier:'',password:''}),[showOfficeSetup,setShowOfficeSetup]=useState(false),[setup,setSetup]=useState({identifier:'',code:'',password:''});
 const[password,setPassword]=useState({currentPassword:'',newPassword:''});
 const[showLoginPassword,setShowLoginPassword]=useState(false),[showSetupCode,setShowSetupCode]=useState(false),[showSetupPassword,setShowSetupPassword]=useState(false),[showCurrentPassword,setShowCurrentPassword]=useState(false),[showNewPassword,setShowNewPassword]=useState(false);
 const[staff,setStaff]=useState<StaffRow[]>([]),[staffSearch,setStaffSearch]=useState(''),[temporary,setTemporary]=useState<{name:string;password:string}|null>(null);
 const[dashboardSearch,setDashboardSearch]=useState(''),[dashboardFilter,setDashboardFilter]=useState<'all'|'missing'|'attention'|'ready'|'complete'>('all'),[bulkWorking,setBulkWorking]=useState(false);
 const[jobs,setJobs]=useState<JobOption[]>([]),[jobsLoading,setJobsLoading]=useState(false),[jobSearch,setJobSearch]=useState(''),[jobMenuOpen,setJobMenuOpen]=useState(false),[jobValid,setJobValid]=useState(false);
 const[form,setForm]=useState({date:new Date().toISOString().slice(0,10),type:'Work' as WorkType,jobNumber:'',start:'07:00',finish:'15:30',breakMinutes:30,notes:''});
 const total=useMemo(()=>hoursBetween(form.start,form.finish,Number(form.breakMinutes)),[form]);

 async function refresh(){const data=await api<{entries:Entry[]}>('/api/timesheets');setEntries(data.entries)}
 async function loadStaff(){if(user?.role!=='admin')return;const data=await api<{staff:StaffRow[]}>('/api/admin/staff');setStaff(data.staff)}
 async function loadJobs(){
  if(jobs.length||jobsLoading)return;
  setJobsLoading(true);
  try{const data=await api<{ok:boolean;jobs:JobOption[]}>('/api/simpro-jobs');setJobs(data.jobs||[])}
  catch(e){setMessage(e instanceof Error?e.message:'Could not load Simpro jobs')}
  finally{setJobsLoading(false)}
 }
 async function loadSession(){
  try{const data=await api<{user:User}>('/api/auth/me');setUser(data.user);if(!data.user.mustChangePassword)await refresh()}
  catch{setUser(null);setEntries([])}
  finally{setLoading(false)}
 }

 useEffect(()=>{
  document.title='Elliot Timesheets';
  const ensureLink=(rel:string,href:string)=>{let el=document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement|null;if(!el){el=document.createElement('link');el.rel=rel;document.head.appendChild(el)}el.href=href};
  const ensureMeta=(name:string,content:string)=>{let el=document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement|null;if(!el){el=document.createElement('meta');el.name=name;document.head.appendChild(el)}el.content=content};
  ensureLink('manifest','/manifest.webmanifest');ensureLink('apple-touch-icon','/icons/apple-touch-icon.png');
  ensureMeta('theme-color','#0f1b26');ensureMeta('apple-mobile-web-app-capable','yes');ensureMeta('apple-mobile-web-app-status-bar-style','black-translucent');ensureMeta('apple-mobile-web-app-title','Elliot Timesheets');
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  loadSession();
 },[]);
 useEffect(()=>{if(user?.role==='admin'&&!user.mustChangePassword)loadStaff()},[user?.role,user?.mustChangePassword]);

 async function signIn(e:FormEvent){e.preventDefault();setMessage('');try{const data=await api<{user:User}>('/api/auth/login',{method:'POST',body:JSON.stringify(login)});setUser(data.user);setLogin({identifier:'',password:''});if(!data.user.mustChangePassword)await refresh()}catch(e){setMessage(e instanceof Error?e.message:'Could not sign in')}}
 async function bootstrap(e:FormEvent){e.preventDefault();setMessage('');try{const data=await api<{user:User}>('/api/auth/bootstrap-admin',{method:'POST',body:JSON.stringify(setup)});setUser(data.user);setSetup({identifier:'',code:'',password:''});setShowOfficeSetup(false);setMessage('Office Admin account created.');await refresh()}catch(e){setMessage(e instanceof Error?e.message:'Could not complete Office setup')}}
 async function changePassword(e:FormEvent){e.preventDefault();setMessage('');try{const data=await api<{user:User}>('/api/auth/change-password',{method:'POST',body:JSON.stringify(password)});setUser(data.user);setPassword({currentPassword:'',newPassword:''});setMessage('Password changed.');await refresh();if(data.user.role==='admin')await loadStaff()}catch(e){setMessage(e instanceof Error?e.message:'Could not change password')}}
 async function logout(){await api('/api/auth/logout',{method:'POST'});setUser(null);setEntries([]);setStaff([]);setMessage('Signed out.')}
 async function submit(e:FormEvent){
  e.preventDefault();setMessage('');
  if(form.type==='Work'&&!form.jobNumber.trim())return setMessage('Please choose a Simpro job.');
  if(form.type==='Work'&&!jobValid)return setMessage('Please choose a job from the Simpro job list.');
  if(total<=0)return setMessage('Check start and finish times.');
  try{
   await api('/api/timesheets',{method:'POST',body:JSON.stringify({...form,breakMinutes:Number(form.breakMinutes),totalHours:total})});
   setMessage('Day submitted for approval.');
   setForm(f=>({...f,jobNumber:'',notes:''}));setJobSearch('');setJobValid(false);await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'Could not submit timesheet')}
 }
 async function action(id:string,actionName:'pm-approve'|'admin-approve'|'reject'){
  let reason='';if(actionName==='reject')reason=window.prompt('Reason for rejection?')||'Rejected';
  try{await api(`/api/timesheets/${id}`,{method:'PATCH',body:JSON.stringify({action:actionName,reason})});await refresh()}
  catch(e){setMessage(e instanceof Error?e.message:'Could not update timesheet')}
 }
 async function bulkFinalApprove(){
  if(user?.role!=='admin')return;
  const ready=entries.filter(e=>e.status==='PM Approved');
  if(!ready.length){setMessage('Nothing is waiting for final approval.');return}
  if(!window.confirm(`Final approve ${ready.length} timesheet${ready.length===1?'':'s'}?`))return;
  setBulkWorking(true);setMessage('');
  let approvedCount=0,failedCount=0;
  for(const entry of ready){
   try{await api(`/api/timesheets/${entry.id}`,{method:'PATCH',body:JSON.stringify({action:'admin-approve',reason:''})});approvedCount++}
   catch{failedCount++}
  }
  await refresh();setBulkWorking(false);
  setMessage(failedCount?`${approvedCount} approved, ${failedCount} could not be approved.`:`${approvedCount} timesheet${approvedCount===1?'':'s'} final approved.`);
 }
 async function staffAction(employeeId:string,actionName:'activate'|'reset-password'|'deactivate'){
  setMessage('');setTemporary(null);
  try{
   const data=await api<{ok:boolean;tempPassword?:string;employee?:{name:string}}>(`/api/admin/staff/${employeeId}/${actionName}`,{method:'POST'});
   if(data.tempPassword&&data.employee)setTemporary({name:data.employee.name,password:data.tempPassword});
   setMessage(actionName==='deactivate'?'Account deactivated.':actionName==='activate'?'Account activated. Give the temporary password to the employee.':'Temporary password reset.');
   await loadStaff();
  }catch(e){setMessage(e instanceof Error?e.message:'Could not update staff account')}
 }
 async function setRole(employeeId:string,role:Role){try{await api(`/api/admin/staff/${employeeId}/role`,{method:'PATCH',body:JSON.stringify({role})});await loadStaff()}catch(e){setMessage(e instanceof Error?e.message:'Could not update role')}}

 if(loading)return <div className="center-screen"><div className="loader-card"><strong>ELLIOT CONTROLS</strong><p>Loading timesheets…</p></div></div>;
 if(!user)return <div className="auth-shell"><div className="auth-card"><div className="brand-kicker">ELLIOT CONTROLS</div><h1>Timesheets</h1><p className="muted">Staff sign in</p>{message&&<div className="message">{message}</div>}
  {!showOfficeSetup?<><form onSubmit={signIn} className="auth-form"><label>Full name or email<input value={login.identifier} onChange={e=>setLogin({...login,identifier:e.target.value})} placeholder="e.g. Aiden Elliot" required autoComplete="username"/></label><label>Password<PasswordInput shown={showLoginPassword} onToggle={()=>setShowLoginPassword(v=>!v)} value={login.password} onChange={e=>setLogin({...login,password:e.target.value})} required autoComplete="current-password"/></label><button className="primary" type="submit">Sign in</button></form><p className="small-note">Your account is activated by Office Admin.</p><button className="text-button" onClick={()=>{setShowOfficeSetup(true);setMessage('')}}>Office Admin setup</button></>
  :<><form onSubmit={bootstrap} className="auth-form"><label>Office Admin name or email<input value={setup.identifier} onChange={e=>setSetup({...setup,identifier:e.target.value})} required/></label><label>Private setup code<PasswordInput shown={showSetupCode} onToggle={()=>setShowSetupCode(v=>!v)} value={setup.code} onChange={e=>setSetup({...setup,code:e.target.value})} required/></label><label>Create Office Admin password<PasswordInput shown={showSetupPassword} onToggle={()=>setShowSetupPassword(v=>!v)} value={setup.password} onChange={e=>setSetup({...setup,password:e.target.value})} minLength={10} required/></label><button className="primary" type="submit">Complete Office setup</button></form><button className="text-button" onClick={()=>setShowOfficeSetup(false)}>Back to staff sign in</button></>}
 </div></div>;

 if(user.mustChangePassword)return <div className="auth-shell"><div className="auth-card"><div className="brand-kicker">ELLIOT CONTROLS</div><h1>Choose your password</h1><p className="muted">Hi {user.name}. Replace the temporary password Office gave you.</p>{message&&<div className="message">{message}</div>}<form onSubmit={changePassword} className="auth-form"><label>Temporary password<PasswordInput shown={showCurrentPassword} onToggle={()=>setShowCurrentPassword(v=>!v)} value={password.currentPassword} onChange={e=>setPassword({...password,currentPassword:e.target.value})} required/></label><label>New password<PasswordInput shown={showNewPassword} onToggle={()=>setShowNewPassword(v=>!v)} value={password.newPassword} onChange={e=>setPassword({...password,newPassword:e.target.value})} minLength={10} required/></label><button className="primary" type="submit">Save my password</button></form></div></div>;

 const myEntries=entries.filter(e=>e.employeeId===user.employeeId);
 const queue=user.role==='pm'?entries.filter(e=>e.status==='Submitted'&&e.employeeId!==user.employeeId):user.role==='admin'?entries.filter(e=>e.status==='PM Approved'):[];
 const recentJobs=Array.from(new Set(myEntries.filter(e=>e.jobNumber).map(e=>e.jobNumber))).slice(0,4);
 const filteredStaff=staff.filter(s=>`${s.name} ${s.email} ${s.position}`.toLowerCase().includes(staffSearch.toLowerCase()));
 const jobQuery=jobSearch.trim().toLowerCase();
 const filteredJobs=(jobQuery?jobs.filter(j=>`${j.id} ${j.name} ${j.site} ${j.customer}`.toLowerCase().includes(jobQuery)):jobs).slice(0,30);
 const now=new Date();
 const today=now.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
 const submitted=entries.filter(e=>e.status==='Submitted').length,pmApproved=entries.filter(e=>e.status==='PM Approved').length,approved=entries.filter(e=>e.status==='Admin Approved').length,rejected=entries.filter(e=>e.status==='Rejected').length;

 const monday=new Date(now);const day=(now.getDay()+6)%7;monday.setDate(now.getDate()-day);monday.setHours(0,0,0,0);
 const weekDays=Array.from({length:5},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d});
 const isoLocal=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const weekdayLabels=['Mon','Tue','Wed','Thu','Fri'];
 const activeStaff=staff.filter(s=>s.active);
 const weekEntries=entries.filter(e=>{const d=new Date(`${e.date}T00:00:00`);return d>=weekDays[0]&&d<=new Date(weekDays[4].getTime()+86399999)});
 const rank:Record<Status,number>={'Rejected':4,'Submitted':1,'PM Approved':2,'Admin Approved':3};
 const staffRows=activeStaff.map(s=>{
  const personEntries=weekEntries.filter(e=>e.employeeId===s.employeeId);
  const cells=weekDays.map(d=>{
   const date=isoLocal(d),rows=personEntries.filter(e=>e.date===date);
   if(rows.length===0){
    const future=d>now;
    const isToday=date===isoLocal(now);
    return{date,label:future?'future':isToday?'today-missing':'missing',text:future?'—':isToday?'Due today':'Missing'};
   }
   const worst=rows.slice().sort((a,b)=>rank[b.status]-rank[a.status])[0];
   const total=rows.reduce((sum,e)=>sum+e.totalHours,0);
   return{date,label:worst.status==='Rejected'?'rejected':worst.status==='Admin Approved'?'approved':worst.status==='PM Approved'?'pm-approved':'submitted',text:`${total.toFixed(1)}h`};
  });
  const total=personEntries.reduce((sum,e)=>sum+e.totalHours,0);
  const hasRejected=personEntries.some(e=>e.status==='Rejected');
  const hasMissingPast=cells.some(c=>c.label==='missing');
  const hasSubmitted=personEntries.some(e=>e.status==='Submitted');
  const hasPmApproved=personEntries.some(e=>e.status==='PM Approved');
  const pastWeekdays=weekDays.filter(d=>d<new Date(now.getFullYear(),now.getMonth(),now.getDate())).length;
  const coveredPast=cells.slice(0,pastWeekdays).every(c=>!['missing','rejected'].includes(c.label));
  let dashboardStatus:'missing'|'attention'|'ready'|'complete'='ready';
  let statusText='Ready';
  if(hasRejected){dashboardStatus='attention';statusText='Needs attention'}
  else if(hasMissingPast){dashboardStatus='missing';statusText='Missing'}
  else if(hasSubmitted){dashboardStatus='ready';statusText='Waiting for PM'}
  else if(hasPmApproved){dashboardStatus='ready';statusText='Ready for office'}
  else if(coveredPast&&personEntries.some(e=>e.status==='Admin Approved')){dashboardStatus='complete';statusText='Complete'}
  return{staff:s,cells,total,status:dashboardStatus,statusText};
 });
 const dashboardRows=staffRows.filter(r=>{
  const q=dashboardSearch.trim().toLowerCase();
  const matchesSearch=!q||`${r.staff.name} ${r.staff.position} ${r.staff.email}`.toLowerCase().includes(q);
  const matchesFilter=dashboardFilter==='all'||r.status===dashboardFilter;
  return matchesSearch&&matchesFilter;
 });
 const completeCount=staffRows.filter(r=>r.status==='complete').length;
 const missingCount=staffRows.filter(r=>r.status==='missing').length;
 const attentionCount=staffRows.filter(r=>r.status==='attention').length;
 const weekEnd=weekDays[4].toLocaleDateString('en-AU',{day:'numeric',month:'short'});
 const weekStart=weekDays[0].toLocaleDateString('en-AU',{day:'numeric',month:'short'});

 function chooseJob(j:JobOption){setForm({...form,jobNumber:String(j.id)});setJobSearch(`${j.id} — ${j.name||j.site||'Simpro job'}`);setJobValid(true);setJobMenuOpen(false)}
 function chooseRecent(id:string){const j=jobs.find(x=>String(x.id)===id);if(j)chooseJob(j);else{setJobSearch(id);setJobMenuOpen(true);loadJobs()}}

 return <div className="app-shell"><div className="ambient ambient-one"></div><div className="ambient ambient-two"></div>
  <header className="topbar">
   <div className="brand-lockup">
    <div className="brand-mark">EC</div>
    <div><div className="brand-kicker">ELLIOT CONTROLS</div><h1>Timesheets</h1></div>
   </div>
   <div className="account">
    <div className="account-copy"><strong>{user.name}</strong><span>{roleLabel(user.role)}</span></div>
    <button className="signout-button" onClick={logout}>Sign out</button>
   </div>
  </header>
  <main className="page">{message&&<div className="message">{message}</div>}

   {user.role==='pm'&&<section className="summary-grid">
    <Summary label="Submitted" value={submitted}/>
    <Summary label="PM approved" value={pmApproved}/>
    <Summary label="Final approved" value={approved}/>
    <Summary label="Needs attention" value={rejected}/>
   </section>}

   {user.role==='pm'&&<section className="card priority-card">
    <div className="section-head"><div><span className="eyebrow">PM APPROVALS</span><h2>{queue.length?`${queue.length} waiting for you`:"You're up to date"}</h2></div><button className="ghost" onClick={refresh}>Refresh</button></div>
    {queue.length===0?<p className="muted">Nothing waiting for approval.</p>:<div className="entry-list">{queue.map(e=><EntryCard key={e.id} entry={e} user={user} action={action}/>)}</div>}
   </section>}

   {user.role==='admin'&&<section className="admin-dashboard">
    <div className="dashboard-heading"><div><span className="eyebrow">OFFICE DASHBOARD</span><h2><span className="dashboard-dot"></span>This week • {weekStart}–{weekEnd}</h2><p className="muted">See who is complete, who is missing time, and what needs approval.</p></div><div className="dashboard-actions"><button className="ghost" onClick={refresh}>Refresh</button><button className="primary" disabled={bulkWorking||pmApproved===0} onClick={bulkFinalApprove}>{bulkWorking?'Approving…':`Final approve ready (${pmApproved})`}</button></div></div>

    <div className="summary-grid admin-summary">
     <Summary label="Active staff" value={activeStaff.length}/>
     <Summary label="Complete" value={completeCount}/>
     <Summary label="Missing" value={missingCount}/>
     <Summary label="Needs attention" value={attentionCount}/>
    </div>

    <div className="dashboard-toolbar">
     <input value={dashboardSearch} onChange={e=>setDashboardSearch(e.target.value)} placeholder="Search employee"/>
     <div className="dashboard-filters">
      {(['all','missing','attention','ready','complete'] as const).map(f=><button key={f} type="button" className={dashboardFilter===f?'active':''} onClick={()=>setDashboardFilter(f)}>{f==='all'?'All':f==='attention'?'Needs attention':f[0].toUpperCase()+f.slice(1)}</button>)}
     </div>
    </div>

    <div className="week-table-wrap"><table className="week-table">
     <thead><tr><th>Employee</th>{weekdayLabels.map((d,i)=><th key={d}><span>{d}</span><small>{weekDays[i].getDate()}</small></th>)}<th>Hours</th><th>Status</th></tr></thead>
     <tbody>{dashboardRows.length===0?<tr><td colSpan={8} className="empty-table">No staff match this view.</td></tr>:dashboardRows.map(r=><tr key={r.staff.employeeId}>
      <td><strong>{r.staff.name}</strong><span>{r.staff.position||'Staff'}</span></td>
      {r.cells.map(c=><td key={c.date}><span className={`day-chip ${c.label}`}>{c.text}</span></td>)}
      <td className="hours-cell"><strong>{r.total.toFixed(1)}</strong></td>
      <td><span className={`dashboard-status ${r.status}`}>{r.statusText}</span></td>
     </tr>)}</tbody>
    </table></div>

    <section className="card priority-card embedded-queue">
     <div className="section-head"><div><span className="eyebrow">OFFICE APPROVALS</span><h2>{queue.length?`${queue.length} waiting for final approval`:'No final approvals waiting'}</h2></div></div>
     {queue.length===0?<p className="muted">PM-approved entries will appear here.</p>:<div className="entry-list">{queue.map(e=><EntryCard key={e.id} entry={e} user={user} action={action}/>)}</div>}
    </section>
   </section>}

   <section className="card quick-entry hero-entry">
    <div className="today-strip"><div><span className="eyebrow">TODAY</span><h2>{today}</h2><p className="entry-subtitle">Your day, ready in seconds.</p></div><div className="hours-orb"><span>Today</span><strong>{total.toFixed(2)}</strong><small>hours</small></div></div>
    <form onSubmit={submit} className="simple-form">
     <div className="type-pills">{workTypes.map(t=><button key={t} type="button" className={form.type===t?'active':''} onClick={()=>{setForm({...form,type:t,breakMinutes:t==='Work'?30:0,jobNumber:t==='Work'?form.jobNumber:''});if(t!=='Work'){setJobSearch('');setJobValid(false);setJobMenuOpen(false)}}}>{t}</button>)}</div>

     {form.type==='Work'&&<>
      {recentJobs.length>0&&<div className="recent-jobs"><span>Recent jobs</span><div>{recentJobs.map(id=><button key={id} type="button" onClick={()=>chooseRecent(id)}>Job {id}</button>)}</div></div>}
      <label>Job<div className="job-picker"><input value={jobSearch} onFocus={()=>{setJobMenuOpen(true);loadJobs()}} onChange={e=>{setJobSearch(e.target.value);setForm({...form,jobNumber:''});setJobValid(false);setJobMenuOpen(true);loadJobs()}} placeholder={jobsLoading?'Loading Simpro jobs…':'Search job name or number'} autoComplete="off"/>
       {jobMenuOpen&&<div className="job-menu">{jobsLoading?<div className="job-empty">Loading jobs…</div>:filteredJobs.length===0?<div className="job-empty">No matching Simpro jobs.</div>:filteredJobs.map(j=><button key={j.id} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>chooseJob(j)}><strong>{j.name||j.site||`Job ${j.id}`}</strong><span>#{j.id}{j.site?` • ${j.site}`:''}{j.customer?` • ${j.customer}`:''}</span></button>)}</div>}
      </div>{jobValid&&<span className="job-ok">✓ Simpro job selected</span>}</label>
     </>}

     <div className="time-row">
      <label>Start<input type="time" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label>
      <label>Finish<input type="time" value={form.finish} onChange={e=>setForm({...form,finish:e.target.value})}/></label>
      <label>Break<input type="number" min="0" max="240" value={form.breakMinutes} onChange={e=>setForm({...form,breakMinutes:Number(e.target.value)})}/><span className="field-hint">minutes</span></label>
     </div>
     <label>Notes <span className="optional">(optional)</span><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Only if needed"/></label>
     <button className="primary submit-day" type="submit"><span>Submit day</span><strong>{total.toFixed(2)} hrs</strong></button>
    </form>
   </section>

   <section className="card">
    <div className="section-head"><div><span className="eyebrow">MY TIMESHEETS</span><h2>Recent days</h2></div><button className="ghost" onClick={refresh}>Refresh</button></div>
    {myEntries.length===0?<p className="muted">No timesheets yet.</p>:<div className="entry-list">{myEntries.slice(0,8).map(e=><EntryCard key={e.id} entry={e} user={user} action={action}/>)}</div>}
   </section>

   {user.role==='admin'&&<details className="card admin-tools">
    <summary><strong>Office Admin tools</strong><span>Staff accounts & permissions</span></summary>
    <div className="admin-body"><div className="section-head"><div><span className="eyebrow">STAFF</span><h2>Manage accounts</h2></div><button className="ghost" onClick={loadStaff}>Refresh</button></div>
    <input className="staff-search" value={staffSearch} onChange={e=>setStaffSearch(e.target.value)} placeholder="Search staff"/>
    {temporary&&<div className="temporary"><strong>Temporary password for {temporary.name}</strong><code>{temporary.password}</code><span>Copy this now. It is only shown after activation/reset.</span></div>}
    <div className="staff-list">{filteredStaff.map(s=><div className="staff-row" key={s.employeeId}><div className="staff-person"><strong>{s.name}</strong><span>{s.position||'No position'} • Simpro #{s.employeeId}</span></div><div className="staff-controls"><select value={s.role} onChange={e=>setRole(s.employeeId,e.target.value as Role)}><option value="staff">Staff</option><option value="pm">Project Manager</option><option value="admin">Office Admin</option></select><span className={`account-status ${s.active?'active':'inactive'}`}>{s.active?(s.mustChangePassword?'Temp password issued':'Active'):'Not activated'}</span>{s.active?<><button className="ghost" onClick={()=>staffAction(s.employeeId,'reset-password')}>Reset</button><button className="danger" onClick={()=>staffAction(s.employeeId,'deactivate')}>Deactivate</button></>:<button className="primary" onClick={()=>staffAction(s.employeeId,'activate')}>Activate</button>}</div></div>)}</div>
    </div>
   </details>}
  </main>
 </div>;
}

function Summary({label,value}:{label:string;value:number}){return <div className="summary-card"><span>{label}</span><strong>{value}</strong></div>}

function PasswordInput({shown,onToggle,...props}:{shown:boolean;onToggle:()=>void}&Omit<InputHTMLAttributes<HTMLInputElement>,'type'>){
 return <div style={{position:'relative',width:'100%'}}><input {...props} type={shown?'text':'password'} style={{...(props.style||{}),paddingRight:'48px',width:'100%'}}/><button type="button" onClick={onToggle} aria-label={shown?'Hide password':'Show password'} title={shown?'Hide password':'Show password'} style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',border:0,background:'transparent',padding:'8px',cursor:'pointer',fontSize:'20px',lineHeight:1,color:'inherit'}}>{shown?'🙈':'👁️'}</button></div>
}

function EntryCard({entry,user,action}:{entry:Entry;user:User;action:(id:string,a:'pm-approve'|'admin-approve'|'reject')=>void}){
 return <div className="entry"><div><div className="entry-title"><strong>{entry.employee}</strong><span className={`badge status-${statusClass(entry.status)}`}>{entry.status}</span></div><div className="entry-meta"><span>{entry.date}</span><span>{entry.type}</span><span>{entry.start}–{entry.finish}</span><span>{entry.totalHours.toFixed(2)} hrs</span></div>{entry.jobNumber&&<div className="job">Job #{entry.jobNumber}</div>}{entry.notes&&<p>{entry.notes}</p>}{entry.status==='Admin Approved'&&<p className="simpro">Simpro: {entry.simproStatus||'Awaiting API connection'}</p>}{entry.rejectionReason&&<p className="rejected">Rejected: {entry.rejectionReason}</p>}</div><div className="actions">{user.role==='pm'&&entry.status==='Submitted'&&entry.employeeId!==user.employeeId&&<><button className="primary" onClick={()=>action(entry.id,'pm-approve')}>Approve</button><button className="danger" onClick={()=>action(entry.id,'reject')}>Reject</button></>}{user.role==='admin'&&entry.status==='PM Approved'&&<><button className="primary" onClick={()=>action(entry.id,'admin-approve')}>Final approve</button><button className="danger" onClick={()=>action(entry.id,'reject')}>Reject</button></>}</div></div>
}
