import {FormEvent,useEffect,useMemo,useState} from 'react';
import {api,Entry,hoursBetween,JobOption,setManifest,User,workTypes,WorkType} from './appShared';

function toIsoDate(date:Date){
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function currentWedTueWeek(){
 const today=new Date();
 today.setHours(0,0,0,0);
 const start=new Date(today);
 start.setDate(today.getDate()-((today.getDay()-3+7)%7));
 return Array.from({length:7},(_,i)=>{
  const d=new Date(start);
  d.setDate(start.getDate()+i);
  return d;
 });
}

export default function WorkerApp(){
 const[user,setUser]=useState<User|null>(null),[entries,setEntries]=useState<Entry[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 const[login,setLogin]=useState({identifier:'',password:''}),[show,setShow]=useState(false);
 const[jobs,setJobs]=useState<JobOption[]>([]),[jobSearch,setJobSearch]=useState(''),[jobOpen,setJobOpen]=useState(false);
 const[editing,setEditing]=useState<string|null>(null),[submitting,setSubmitting]=useState(false);
 const weekDays=useMemo(()=>currentWedTueWeek(),[]);
 const todayIso=toIsoDate(new Date());
 const defaultDate=weekDays.some(d=>toIsoDate(d)===todayIso)?todayIso:toIsoDate(weekDays[0]);
 const[form,setForm]=useState({date:defaultDate,type:'Work' as WorkType,jobNumber:'',start:'07:00',finish:'15:30',breakMinutes:0,notes:''});
 const total=useMemo(()=>hoursBetween(form.start,form.finish,0),[form.start,form.finish]);
 const selectedDate=useMemo(()=>new Date(`${form.date}T00:00:00`),[form.date]);

 useEffect(()=>{setManifest(false);load()},[]);
 async function load(){try{const m=await api<{user:User}>('/api/auth/me');setUser(m.user);const t=await api<{entries:Entry[]}>('/api/timesheets');setEntries(t.entries)}catch{setUser(null)}finally{setLoading(false)}}
 async function loginNow(e:FormEvent){e.preventDefault();try{const m=await api<{user:User}>('/api/auth/login',{method:'POST',body:JSON.stringify(login)});setUser(m.user);await load()}catch(e){setMessage(e instanceof Error?e.message:'Login failed')}}
 async function logout(){await api('/api/auth/logout',{method:'POST'});setUser(null)}
 async function loadJobs(){if(jobs.length)return;const d=await api<{jobs:JobOption[]}>('/api/simpro-jobs');setJobs(d.jobs||[])}
 function choose(j:JobOption){setForm({...form,jobNumber:String(j.id)});setJobSearch(`${j.id} — ${j.name||j.site}`);setJobOpen(false)}
 async function save(){
  if(submitting)return;
  setMessage('');
  if(form.type==='Work'&&!form.jobNumber.trim())return setMessage('Choose a Simpro job.');
  if(total<=0)return setMessage('Check start and finish times.');
  setSubmitting(true);
  setJobOpen(false);
  try{
   const payload={...form,breakMinutes:0,totalHours:total};
   if(editing)await api(`/api/timesheets/${editing}`,{method:'PATCH',body:JSON.stringify({action:'edit',...payload})});
   else await api('/api/timesheets',{method:'POST',body:JSON.stringify(payload)});
   setMessage(editing?'Updated and resubmitted.':'Day submitted successfully.');
   cancel();
   await load();
  }catch(e){
   setMessage(e instanceof Error?e.message:'Could not submit day');
  }finally{
   setSubmitting(false);
  }
 }
 function edit(e:Entry){setEditing(e.id);setForm({date:e.date,type:e.type,jobNumber:e.jobNumber,start:e.start,finish:e.finish,breakMinutes:0,notes:e.notes||''});setJobSearch(e.jobNumber?`Job ${e.jobNumber}`:'');scrollTo({top:0,behavior:'smooth'})}
 function cancel(){setEditing(null);setForm({date:defaultDate,type:'Work',jobNumber:'',start:'07:00',finish:'15:30',breakMinutes:0,notes:''});setJobSearch('');}
 function weekBounds(dateString:string){const d=new Date(`${dateString}T00:00:00`);const start=new Date(d);start.setDate(d.getDate()-((d.getDay()-3+7)%7));const end=new Date(start);end.setDate(start.getDate()+6);return{start:toIsoDate(start),end:toIsoDate(end),label:`${start.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-AU',{day:'numeric',month:'short'})}`}}
 async function reviewPersonWeek(employeeId:string,startDate:string,endDate:string,action:'approve'|'reject'){
  let reason='';
  if(action==='reject')reason=prompt('Reason for rejecting this employee week?')||'Rejected';
  try{
   const d=await api<{count:number}>('/api/timesheets/week-approval',{method:'PATCH',body:JSON.stringify({employeeId,startDate,endDate,action,reason})});
   setMessage(action==='approve'?`${d.count} day${d.count===1?'':'s'} approved for payroll.`:`${d.count} day${d.count===1?'':'s'} rejected.`);
   await load();
  }catch(e){setMessage(e instanceof Error?e.message:'Could not update employee week')}
 }
 async function del(e:Entry){if(!confirm('Delete this timesheet?'))return;await api(`/api/timesheets/${e.id}`,{method:'DELETE'});await load()}
 const q=jobSearch.toLowerCase(),matches=(q?jobs.filter(j=>`${j.id} ${j.name} ${j.site} ${j.customer}`.toLowerCase().includes(q)):jobs).slice(0,20);
 const pmPendingGroups=useMemo(()=>{
  if(user?.role!=='pm')return [] as {key:string;employeeId:string;employee:string;start:string;end:string;label:string;entries:Entry[];total:number}[];
  const map=new Map<string,{key:string;employeeId:string;employee:string;start:string;end:string;label:string;entries:Entry[];total:number}>();
  entries.filter(e=>e.employeeId!==user.employeeId&&(e.status==='Submitted'||e.status==='PM Approved')).forEach(e=>{const w=weekBounds(e.date),key=`${e.employeeId}|${w.start}`;const g=map.get(key)||{key,employeeId:e.employeeId,employee:e.employee,start:w.start,end:w.end,label:w.label,entries:[],total:0};g.entries.push(e);g.total+=e.totalHours;map.set(key,g)});
  return [...map.values()].map(g=>({...g,entries:g.entries.sort((a,b)=>a.date.localeCompare(b.date))})).sort((a,b)=>b.start.localeCompare(a.start)||a.employee.localeCompare(b.employee));
 },[entries,user?.role,user?.employeeId]);

 if(loading)return <div className="gate">Loading…</div>;
 if(!user)return <div className="auth-shell"><div className="auth-card"><b>ELLIOT CONTROLS</b><h1>Timesheets</h1>{message&&<div className="message">{message}</div>}<form onSubmit={loginNow}><label>Full name or email<input value={login.identifier} onChange={e=>setLogin({...login,identifier:e.target.value})}/></label><label>Password<div className="pass"><input type={show?'text':'password'} value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/><button type="button" onClick={()=>setShow(v=>!v)}>👁️</button></div></label><button className="primary">Sign in</button></form></div></div>;

 const mine=entries.filter(e=>e.employeeId===user.employeeId);
 return <div className="worker"><header><div><span>ELLIOT CONTROLS</span><strong>Timesheets</strong></div><button onClick={logout}>Sign out</button></header><main>{message&&<div className="message">{message}</div>}<section className="entry-card"><div className="entry-head"><div><span>{editing?'EDIT ENTRY':'SELECT A DAY'}</span><h1>{selectedDate.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}</h1></div><div className="hours"><b>{total.toFixed(2)}</b><small>hrs</small></div></div><form onSubmit={e=>{e.preventDefault();void save()}}>
 <div className="types">{workTypes.map(t=><button type="button" key={t} className={form.type===t?'active':''} onClick={()=>{setForm({...form,type:t,jobNumber:t==='Work'?form.jobNumber:''});if(t!=='Work'){setJobSearch('');}}}>{t}</button>)}</div>
 {form.type==='Work'&&<label>Job<div className="jobpick"><input value={jobSearch} onFocus={()=>{setJobOpen(true);loadJobs()}} onChange={e=>{setJobSearch(e.target.value);setJobOpen(true);loadJobs()}} placeholder="Search job name or number"/>{jobOpen&&<div className="jobmenu">{matches.map(j=><button type="button" key={j.id} onClick={()=>choose(j)}><b>{j.name||`Job ${j.id}`}</b><span>#{j.id}</span></button>)}</div>}</div></label>}
 <div className="times no-break"><label>Start<input type="time" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label><label>Finish<input type="time" value={form.finish} onChange={e=>setForm({...form,finish:e.target.value})}/></label></div>
 <div className="worker-week-block"><span className="week-label">WEDNESDAY → TUESDAY</span><div className="worker-week-days">{weekDays.map(d=>{const iso=toIsoDate(d),active=iso===form.date;return <button type="button" key={iso} className={active?'active':''} onClick={()=>setForm({...form,date:iso})}><span>{d.toLocaleDateString('en-AU',{weekday:'short'}).replace('.','')}</span><b>{d.getDate()}</b></button>})}</div><button className="primary compact-submit" type="button" disabled={submitting} onClick={()=>void save()}><span>{submitting?'Submitting…':editing?'Save & resubmit':'Submit day'}</span><b>{total.toFixed(2)} hrs</b></button></div>
 </form></section>{user.role==='pm'&&<section className="list pm-approval-list"><div className="approval-title"><div><span className="week-label">APPROVALS</span><h2>Approve by person</h2><p className="muted">Review the full Wednesday–Tuesday week, then approve once for that person.</p></div><button onClick={load}>Refresh</button></div>{pmPendingGroups.length===0?<p className="muted">No employee weeks waiting for approval.</p>:pmPendingGroups.map(g=><div className="person-approval" key={g.key}><div className="person-approval-head"><div><b>{g.employee}</b><span>{g.label} • {g.entries.length} entr{g.entries.length===1?'y':'ies'} • {g.total.toFixed(2)} hrs</span></div><div><button className="primary" onClick={()=>reviewPersonWeek(g.employeeId,g.start,g.end,'approve')}>Approve person</button><button className="danger" onClick={()=>reviewPersonWeek(g.employeeId,g.start,g.end,'reject')}>Reject person</button></div></div><div className="approval-days">{g.entries.map(e=><div key={e.id}><b>{new Date(`${e.date}T00:00:00`).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</b><span>{e.type} • {e.totalHours.toFixed(2)} hrs {e.jobNumber?`• Job ${e.jobNumber}`:''}</span></div>)}</div></div>)}</section>}<section className="list"><h2>My recent timesheets</h2>{mine.slice(0,10).map(e=><div className="row" key={e.id}><div><b>{e.date} • {e.type}</b><span>{e.totalHours.toFixed(2)} hrs {e.jobNumber?`• Job ${e.jobNumber}`:''}</span><small>{e.status}</small></div>{['Submitted','Rejected'].includes(e.status)&&<div><button onClick={()=>edit(e)}>Edit</button><button className="danger" onClick={()=>del(e)}>Delete</button></div>}</div>)}</section>{user.role==='admin'&&<a className="adminlink" href="/admin">Open Office Admin Console →</a>}</main></div>
}
