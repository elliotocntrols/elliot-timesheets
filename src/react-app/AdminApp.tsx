import {useEffect,useMemo,useState} from 'react';
import ExcelJS from 'exceljs';
import {api,Entry,setManifest,StaffRow,User} from './appShared';

type Tab='dashboard'|'payroll'|'staff'|'integrations';

export default function AdminApp(){
 const[user,setUser]=useState<User|null>(null),[entries,setEntries]=useState<Entry[]>([]),[staff,setStaff]=useState<StaffRow[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[tab,setTab]=useState<Tab>('dashboard'),[offset,setOffset]=useState(0),[search,setSearch]=useState('');
 useEffect(()=>{setManifest(true);load()},[]);
 async function load(){setLoading(true);try{const m=await api<{user:User}>('/api/auth/me');setUser(m.user);if(m.user.role!=='admin')return;const[t,s]=await Promise.all([api<{entries:Entry[]}>('/api/timesheets'),api<{staff:StaffRow[]}>('/api/admin/staff')]);setEntries(t.entries);setStaff(s.staff)}catch{setUser(null)}finally{setLoading(false)}}
 async function approve(id:string,action:'admin-approve'|'reject'){let reason='';if(action==='reject')reason=prompt('Reason for rejection?')||'Rejected';try{await api(`/api/timesheets/${id}`,{method:'PATCH',body:JSON.stringify({action,reason})});await load()}catch(e){setMessage(e instanceof Error?e.message:'Could not update')}}
 async function staffAction(id:string,action:'activate'|'reset-password'|'deactivate'){try{const d=await api<any>(`/api/admin/staff/${id}/${action}`,{method:'POST'});if(d.tempPassword)alert(`Temporary password for ${d.employee.name}: ${d.tempPassword}`);await load()}catch(e){setMessage(e instanceof Error?e.message:'Could not update staff')}}
 async function setRole(id:string,role:'staff'|'pm'|'admin'){await api(`/api/admin/staff/${id}/role`,{method:'PATCH',body:JSON.stringify({role})});await load()}
 async function setPattern(id:string,days:number[]){await api(`/api/admin/staff/${id}/work-pattern`,{method:'PATCH',body:JSON.stringify({days})});setStaff(x=>x.map(s=>s.employeeId===id?{...s,workDays:days}:s))}
 async function logout(){await api('/api/auth/logout',{method:'POST'});location.href='/'}

 const week=useMemo(()=>{const n=new Date(),s=new Date(n);s.setDate(n.getDate()-((n.getDay()-3+7)%7)+offset*7);s.setHours(0,0,0,0);const days=Array.from({length:7},(_,i)=>{const d=new Date(s);d.setDate(s.getDate()+i);return d});const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const es=entries.filter(e=>{const d=new Date(`${e.date}T00:00:00`);return d>=days[0]&&d<=new Date(days[6].getTime()+86399999)});return{days,iso,entries:es,label:`${days[0].toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${days[6].toLocaleDateString('en-AU',{day:'numeric',month:'short'})}`}},[entries,offset]);
 const active=staff.filter(s=>s.active),waiting=week.entries.filter(e=>e.status==='Submitted'||e.status==='PM Approved'),approved=week.entries.filter(e=>e.status==='Admin Approved'),rejected=week.entries.filter(e=>e.status==='Rejected');
 const payroll=active.map(s=>{const es=week.entries.filter(e=>e.employeeId===s.employeeId);const approvedEs=es.filter(e=>e.status==='Admin Approved');const sum=(rows:Entry[],t:string)=>rows.filter(e=>e.type===t).reduce((a,e)=>a+e.totalHours,0);const statusHours=(status:Entry['status'])=>es.filter(e=>e.status===status).reduce((a,e)=>a+e.totalHours,0);return{s,work:sum(es,'Work'),rdo:sum(es,'RDO'),sick:sum(es,'Sick Leave'),annual:sum(es,'Annual Leave'),ph:sum(es,'Public Holiday'),training:sum(es,'Training'),total:es.reduce((a,e)=>a+e.totalHours,0),pendingPM:statusHours('Submitted'),waitingOffice:statusHours('PM Approved'),approved:statusHours('Admin Approved'),rejected:statusHours('Rejected'),approvedTotal:approvedEs.reduce((a,e)=>a+e.totalHours,0)}}).filter(r=>!search||`${r.s.name} ${r.s.position}`.toLowerCase().includes(search.toLowerCase()));
 const approvedPayroll=payroll.map(r=>({...r,work:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Work').reduce((a,e)=>a+e.totalHours,0),rdo:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='RDO').reduce((a,e)=>a+e.totalHours,0),sick:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Sick Leave').reduce((a,e)=>a+e.totalHours,0),annual:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Annual Leave').reduce((a,e)=>a+e.totalHours,0),ph:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Public Holiday').reduce((a,e)=>a+e.totalHours,0),training:week.entries.filter(e=>e.employeeId===r.s.employeeId&&e.status==='Admin Approved'&&e.type==='Training').reduce((a,e)=>a+e.totalHours,0),total:r.approvedTotal}));
 function exportCsv(){const rows=[['Employee ID','Employee','Work','RDO','Sick','Annual Leave','Public Holiday','Training','Total'],...approvedPayroll.map(r=>[r.s.employeeId,r.s.name,r.work,r.rdo,r.sick,r.annual,r.ph,r.training,r.total])];const csv=rows.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=u;a.download=`Elliot-Payroll-${week.iso(week.days[0])}.csv`;a.click();URL.revokeObjectURL(u)}

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

   // Clear previous import rows while preserving the template layout.
   for(let row=5;row<=2004;row++){
    for(let col=1;col<=7;col++)sheet.getCell(row,col).value=null;
   }

   const approvedEntries=week.entries
    .filter(e=>e.status==='Admin Approved')
    .sort((a,b)=>a.date.localeCompare(b.date)||a.employee.localeCompare(b.employee));

   approvedEntries.forEach((e,i)=>{
    const row=5+i;
    const [y,m,d]=e.date.split('-').map(Number);
    sheet.getCell(row,1).value=e.employeeId;
    sheet.getCell(row,2).value=e.employee;
    sheet.getCell(row,3).value=new Date(y,m-1,d);
    sheet.getCell(row,3).numFmt='dd/mm/yyyy';
    sheet.getCell(row,4).value=e.type;
    sheet.getCell(row,5).value=e.jobNumber||'';
    sheet.getCell(row,6).value=e.totalHours;
    sheet.getCell(row,6).numFmt='0.00';
    sheet.getCell(row,7).value='Admin Approved';
   });

   workbook.calcProperties.fullCalcOnLoad=true;

   const output=await workbook.xlsx.writeBuffer();
   const blob=new Blob([output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');
   a.href=url;
   a.download=`Wages_${week.iso(week.days[0])}_to_${week.iso(week.days[6])}.xlsx`;
   a.click();
   URL.revokeObjectURL(url);
   setMessage(`Wage workbook generated with ${approvedEntries.length} approved timesheet entr${approvedEntries.length===1?'y':'ies'}.`);
  }catch(e){
   setMessage(e instanceof Error?e.message:'Could not generate wage workbook');
  }
 }

 if(loading)return <div className="gate">Loading Office Admin…</div>;
 if(!user)return <div className="gate"><h1>Office Admin</h1><a href="/">Sign in through Timesheets</a></div>;
 if(user.role!=='admin')return <div className="gate"><h1>Office Admin only</h1><a href="/">Back to Timesheets</a></div>;

 return <div className="admin"><aside><div className="brand"><span>EC</span><div><b>Elliot Controls</b><small>Office Admin</small></div></div><nav>{(['dashboard','payroll','staff','integrations'] as Tab[]).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</nav><div className="bottom"><a href="/">Worker App</a><button onClick={logout}>Sign out</button></div></aside><main><header className="admintop"><div><span>OFFICE ADMIN</span><h1>{tab[0].toUpperCase()+tab.slice(1)}</h1></div><div className="weeks"><button onClick={()=>setOffset(v=>v-1)}>←</button><b>{week.label}</b><button onClick={()=>setOffset(v=>v+1)}>→</button></div></header>{message&&<div className="message">{message}</div>}
 {tab==='dashboard'&&<><section className="metrics"><Metric l="Active staff" v={active.length}/><Metric l="Final approved" v={approved.length}/><Metric l="Awaiting approval" v={waiting.length}/><Metric l="Needs attention" v={rejected.length}/></section><section className="panel"><div className="panelhead"><div><span>APPROVALS</span><h2>{waiting.length?`${waiting.length} waiting`:'All clear'}</h2></div><button onClick={load}>Refresh</button></div>{waiting.map(e=><div className="approval" key={e.id}><div><b>{e.employee}</b><span>{e.date} • {e.type} • {e.totalHours.toFixed(2)} hrs {e.jobNumber?`• Job ${e.jobNumber}`:''}</span></div><div><button className="primary" onClick={()=>approve(e.id,'admin-approve')}>Approve for payroll</button><button className="danger" onClick={()=>approve(e.id,'reject')}>Reject</button></div></div>)}</section></>}
 {tab==='payroll'&&<><section className="payhero"><div><span>WEDNESDAY → TUESDAY</span><h2>Payroll Preview</h2><p>All entered time appears here immediately. Only the green Approved hours are sent to Wages.xlsx.</p></div><div className="payroll-actions"><button className="primary" onClick={generateWages}>Generate Wages.xlsx</button><button className="secondary-dark" onClick={exportCsv}>Export Approved CSV</button></div></section><section className="payroll-status-cards"><div><span>Awaiting approval</span><b>{week.entries.filter(e=>e.status==='Submitted'||e.status==='PM Approved').reduce((a,e)=>a+e.totalHours,0).toFixed(2)} hrs</b></div><div><span>Waiting for Office</span><b>{week.entries.filter(e=>e.status==='PM Approved').reduce((a,e)=>a+e.totalHours,0).toFixed(2)} hrs</b></div><div className="approved-card"><span>Approved for Payroll</span><b>{week.entries.filter(e=>e.status==='Admin Approved').reduce((a,e)=>a+e.totalHours,0).toFixed(2)} hrs</b></div><div className="rejected-card"><span>Rejected</span><b>{week.entries.filter(e=>e.status==='Rejected').reduce((a,e)=>a+e.totalHours,0).toFixed(2)} hrs</b></div></section><section className="panel"><div className="panelhead"><div><h2>{week.label}</h2><p className="payroll-note">Entered hours are visible before approval. Status columns show exactly where each employee's time is.</p></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee"/></div><div className="tablewrap"><table><thead><tr><th>Employee</th><th>Work</th><th>RDO</th><th>Sick</th><th>Annual</th><th>P/Hol</th><th>Training</th><th>Total Entered</th><th>Awaiting approval</th><th>Legacy PM approved</th><th>Approved</th><th>Rejected</th></tr></thead><tbody>{payroll.map(r=><tr key={r.s.employeeId}><td><b>{r.s.name}</b><small>{r.s.position}</small></td><td>{r.work.toFixed(2)}</td><td>{r.rdo.toFixed(2)}</td><td>{r.sick.toFixed(2)}</td><td>{r.annual.toFixed(2)}</td><td>{r.ph.toFixed(2)}</td><td>{r.training.toFixed(2)}</td><td><b>{r.total.toFixed(2)}</b></td><td><span className="status-hours pending">{r.pendingPM.toFixed(2)}</span></td><td><span className="status-hours waiting">{r.waitingOffice.toFixed(2)}</span></td><td><span className="status-hours approved">{r.approved.toFixed(2)}</span></td><td><span className="status-hours rejected">{r.rejected.toFixed(2)}</span></td></tr>)}</tbody></table></div></section></>}
 {tab==='staff'&&<section className="panel"><div className="panelhead"><h2>Accounts & work patterns</h2><button onClick={load}>Refresh</button></div>{staff.map(s=>{const days=s.workDays||[3,4,5,1,2],opts:[string,number][]=[['Wed',3],['Thu',4],['Fri',5],['Sat',6],['Sun',0],['Mon',1],['Tue',2]];return <div className="staffrow" key={s.employeeId}><div><b>{s.name}</b><span>{s.position||'No position'} • Simpro #{s.employeeId}</span><div className="daypills">{opts.map(([l,n])=>{const on=days.includes(n);return <button key={l} className={on?'active':''} onClick={()=>setPattern(s.employeeId,on?days.filter(d=>d!==n):[...days,n].sort((a,b)=>a-b))}>{l}</button>})}</div></div><div><select value={s.role} onChange={e=>setRole(s.employeeId,e.target.value as any)}><option value="staff">Staff</option><option value="pm">Project Manager</option><option value="admin">Office Admin</option></select>{s.active?<><button onClick={()=>staffAction(s.employeeId,'reset-password')}>Reset</button><button className="danger" onClick={()=>staffAction(s.employeeId,'deactivate')}>Deactivate</button></>:<button className="primary" onClick={()=>staffAction(s.employeeId,'activate')}>Activate</button>}</div></div>})}</section>}
 {tab==='integrations'&&<section className="integrations"><Card t="Simpro" s="Connected" d="Live job lookup and Safe Mode verification." good/><Card t="MYOB" s="Not connected" d="Ready for API/OAuth setup."/><Card t="Payroll spreadsheet" s="Export ready" d="Approved payroll hours can be exported from the Payroll tab."/></section>}
 </main></div>
}
function Metric({l,v}:{l:string;v:number}){return <div className="metric"><span>{l}</span><b>{v}</b></div>}
function Card({t,s,d,good}:{t:string;s:string;d:string;good?:boolean}){return <div className="icard"><div><b>{t}</b><span className={good?'good':''}>{s}</span></div><p>{d}</p></div>}
