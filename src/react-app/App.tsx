import { FormEvent, useEffect, useMemo, useState } from 'react';
import './App.css';

type Role = 'staff' | 'pm' | 'admin';
type WorkType = 'Work' | 'Annual Leave' | 'Sick Leave' | 'RDO' | 'Public Holiday' | 'Training' | 'Other Paid Leave';
type Status = 'Submitted' | 'PM Approved' | 'Admin Approved' | 'Rejected';

type User = { employeeId: string; name: string; email: string; role: Role; position: string };
type Entry = {
  id: string; employeeId: string; employee: string; date: string; type: WorkType; jobNumber: string;
  start: string; finish: string; breakMinutes: number; totalHours: number; notes: string; status: Status;
  pmApprovedBy?: string; adminApprovedBy?: string; rejectionReason?: string; createdAt: string; simproStatus?: string;
};

const workTypes: WorkType[] = ['Work','Annual Leave','Sick Leave','RDO','Public Holiday','Training','Other Paid Leave'];

function hoursBetween(start: string, finish: string, breakMinutes: number) {
  if (!start || !finish) return 0;
  const [sh, sm] = start.split(':').map(Number); const [fh, fm] = finish.split(':').map(Number);
  let mins = fh * 60 + fm - (sh * 60 + sm) - breakMinutes; if (mins < 0) mins += 1440;
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}
function roleLabel(role: Role) { return role === 'pm' ? 'Project Manager' : role === 'admin' ? 'Office Admin' : 'Staff'; }
function statusClass(status: string) { return status.toLowerCase().replace(/ /g, '-'); }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const text = await res.text();
  if (!res.ok) { try { throw new Error(JSON.parse(text).error || 'Request failed'); } catch (e) { if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e; throw new Error(text || 'Request failed'); } }
  return (text ? JSON.parse(text) : {}) as T;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login'|'activate'>('login');
  const [auth, setAuth] = useState({ employeeId:'', email:'', password:'' });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true); const [message, setMessage] = useState('');
  const [form, setForm] = useState({ date:new Date().toISOString().slice(0,10), type:'Work' as WorkType, jobNumber:'', start:'07:00', finish:'15:30', breakMinutes:30, notes:'' });
  const total = useMemo(() => hoursBetween(form.start, form.finish, Number(form.breakMinutes)), [form]);

  async function loadSession() {
    try { const data = await api<{user:User}>('/api/auth/me'); setUser(data.user); await refresh(); }
    catch { setUser(null); setEntries([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadSession(); }, []);

  async function refresh() {
    const data = await api<{entries:Entry[]}>('/api/timesheets'); setEntries(data.entries);
  }

  async function authenticate(e: FormEvent) {
    e.preventDefault(); setMessage('');
    try {
      const data = await api<{user:User}>(authMode === 'login' ? '/api/auth/login' : '/api/auth/register', { method:'POST', body:JSON.stringify(auth) });
      setUser(data.user); setAuth({ employeeId:'', email:'', password:'' }); setMessage(`Signed in as ${data.user.name}.`); await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not sign in'); }
  }
  async function logout() { await api('/api/auth/logout',{method:'POST'}); setUser(null); setEntries([]); setMessage('Signed out.'); }

  async function submit(e: FormEvent) {
    e.preventDefault(); setMessage('');
    if (form.type === 'Work' && !form.jobNumber.trim()) return setMessage('Simpro job number is required for worked time.');
    if (total <= 0) return setMessage('Check start and finish times.');
    try {
      await api('/api/timesheets',{method:'POST',body:JSON.stringify({...form,breakMinutes:Number(form.breakMinutes),totalHours:total})});
      setMessage('Timesheet submitted for PM approval.'); setForm(f=>({...f,jobNumber:'',notes:''})); await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not submit timesheet'); }
  }

  async function action(id:string, actionName:'pm-approve'|'admin-approve'|'reject') {
    let reason=''; if (actionName==='reject') reason=window.prompt('Reason for rejection?') || 'Rejected';
    try { await api(`/api/timesheets/${id}`,{method:'PATCH',body:JSON.stringify({action:actionName,reason})}); await refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not update timesheet'); }
  }

  if (loading) return <div className="center-screen"><div className="loader-card"><strong>ELLIOT CONTROLS</strong><p>Loading timesheets…</p></div></div>;

  if (!user) return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand-kicker">ELLIOT CONTROLS</div><h1>Timesheets</h1><p className="muted">Secure staff access</p>
        <div className="auth-tabs"><button className={authMode==='login'?'active':''} onClick={()=>setAuthMode('login')}>Sign in</button><button className={authMode==='activate'?'active':''} onClick={()=>setAuthMode('activate')}>First-time activation</button></div>
        {message && <div className="message">{message}</div>}
        <form onSubmit={authenticate} className="auth-form">
          {authMode==='activate' && <label>Simpro Employee ID<input value={auth.employeeId} onChange={e=>setAuth({...auth,employeeId:e.target.value})} inputMode="numeric" placeholder="e.g. 441" required /></label>}
          <label>Email address<input type="email" value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})} placeholder="Your email from Simpro" required /></label>
          <label>{authMode==='activate'?'Create password':'Password'}<input type="password" value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})} minLength={8} required /></label>
          <button className="primary" type="submit">{authMode==='activate'?'Activate my account':'Sign in'}</button>
        </form>
        {authMode==='activate' && <p className="small-note">Use the Employee ID and email stored against your employee record in Simpro. You only do this once.</p>}
      </div>
    </div>
  );

  const myEntries = entries.filter(e=>e.employeeId===user.employeeId);
  const queue = user.role==='pm' ? entries.filter(e=>e.status==='Submitted' && e.employeeId!==user.employeeId) : user.role==='admin' ? entries.filter(e=>e.status==='PM Approved') : [];

  return <div className="app-shell">
    <header className="topbar"><div><div className="brand-kicker">ELLIOT CONTROLS</div><h1>Timesheets</h1></div><div className="account"><div><strong>{user.name}</strong><span>{roleLabel(user.role)}</span></div><button onClick={logout}>Sign out</button></div></header>
    <main className="page">
      {message && <div className="message">{message}</div>}
      <section className="card">
        <div className="section-head"><div><span className="eyebrow">NEW ENTRY</span><h2>Enter time</h2></div><strong>{total.toFixed(2)} hrs</strong></div>
        <form onSubmit={submit} className="form-grid">
          <label>Date<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
          <label>Type<select value={form.type} onChange={e=>{const type=e.target.value as WorkType;setForm({...form,type,breakMinutes:type==='Work'?30:0,jobNumber:type==='Work'?form.jobNumber:''})}}>{workTypes.map(t=><option key={t}>{t}</option>)}</select></label>
          {form.type==='Work' && <label className="wide">Simpro job number *<input value={form.jobNumber} onChange={e=>setForm({...form,jobNumber:e.target.value})} placeholder="Required" inputMode="numeric"/></label>}
          <label>Start<input type="time" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label>
          <label>Finish<input type="time" value={form.finish} onChange={e=>setForm({...form,finish:e.target.value})}/></label>
          <label>Break (minutes)<input type="number" min="0" max="240" value={form.breakMinutes} onChange={e=>setForm({...form,breakMinutes:Number(e.target.value)})}/></label>
          <label className="wide">Notes<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional"/></label>
          <button className="primary wide" type="submit">Submit timesheet</button>
        </form>
      </section>

      {user.role!=='staff' && <section className="card"><div className="section-head"><div><span className="eyebrow">{user.role==='pm'?'PM APPROVAL QUEUE':'OFFICE ADMIN QUEUE'}</span><h2>Waiting for your approval</h2></div><button className="ghost" onClick={refresh}>Refresh</button></div>
        {queue.length===0?<p className="muted">Nothing waiting for approval.</p>:<div className="entry-list">{queue.map(e=><EntryCard key={e.id} entry={e} user={user} action={action}/>)}</div>}
      </section>}

      <section className="card"><div className="section-head"><div><span className="eyebrow">MY TIMESHEETS</span><h2>Recent entries</h2></div><button className="ghost" onClick={refresh}>Refresh</button></div>
        {myEntries.length===0?<p className="muted">No timesheets yet.</p>:<div className="entry-list">{myEntries.map(e=><EntryCard key={e.id} entry={e} user={user} action={action}/>)}</div>}
      </section>
      <footer>Secure account version • Simpro employee ID linked • Live Simpro posting will be enabled after API approval.</footer>
    </main>
  </div>;
}

function EntryCard({entry:e,user,action}:{entry:Entry;user:User;action:(id:string,a:'pm-approve'|'admin-approve'|'reject')=>void}) {
  return <article className="entry"><div className="entry-main"><div className="entry-title"><strong>{e.employee}</strong><span className={`badge status-${statusClass(e.status)}`}>{e.status}</span></div><div className="entry-meta"><span>{e.date}</span><span>{e.type}</span><span>{e.start}–{e.finish}</span><span>{e.totalHours.toFixed(2)} hrs</span></div>{e.jobNumber&&<div className="job">Job #{e.jobNumber}</div>}{e.notes&&<p>{e.notes}</p>}{e.rejectionReason&&<p className="rejected">Reason: {e.rejectionReason}</p>}{e.status==='Admin Approved'&&<p className="simpro">Simpro: {e.simproStatus||'Awaiting API connection'}</p>}</div><div className="actions">{user.role==='pm'&&e.status==='Submitted'&&e.employeeId!==user.employeeId&&<><button className="primary" onClick={()=>action(e.id,'pm-approve')}>PM approve</button><button className="danger" onClick={()=>action(e.id,'reject')}>Reject</button></>}{user.role==='admin'&&e.status==='PM Approved'&&<><button className="primary" onClick={()=>action(e.id,'admin-approve')}>Final approve</button><button className="danger" onClick={()=>action(e.id,'reject')}>Reject</button></>}</div></article>
}
