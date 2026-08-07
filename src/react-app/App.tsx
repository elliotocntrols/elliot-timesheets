import { FormEvent, useEffect, useMemo, useState } from 'react';
import './App.css';

type Role = 'staff' | 'pm' | 'admin';
type WorkType = 'Work' | 'Annual Leave' | 'Sick Leave' | 'RDO' | 'Public Holiday' | 'Training' | 'Other Paid Leave';
type Status = 'Submitted' | 'PM Approved' | 'Admin Approved' | 'Rejected';

type Entry = {
  id: string;
  employee: string;
  date: string;
  type: WorkType;
  jobNumber: string;
  start: string;
  finish: string;
  breakMinutes: number;
  totalHours: number;
  notes: string;
  status: Status;
  pmApprovedBy?: string;
  adminApprovedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  simproStatus?: string;
};

const workTypes: WorkType[] = ['Work', 'Annual Leave', 'Sick Leave', 'RDO', 'Public Holiday', 'Training', 'Other Paid Leave'];

function hoursBetween(start: string, finish: string, breakMinutes: number) {
  if (!start || !finish) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [fh, fm] = finish.split(':').map(Number);
  let mins = fh * 60 + fm - (sh * 60 + sm) - breakMinutes;
  if (mins < 0) mins += 24 * 60;
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (!res.ok) throw new Error((await res.text()) || 'Request failed');
  return res.json() as Promise<T>;
}

export default function App() {
  const [role, setRole] = useState<Role>('staff');
  const [name, setName] = useState(localStorage.getItem('ec-name') || '');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'Work' as WorkType,
    jobNumber: '',
    start: '07:00',
    finish: '15:30',
    breakMinutes: 30,
    notes: '',
  });

  const total = useMemo(() => hoursBetween(form.start, form.finish, Number(form.breakMinutes)), [form]);

  async function refresh() {
    try {
      const data = await api<{ entries: Entry[] }>('/api/timesheets');
      setEntries(data.entries);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load timesheets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => { localStorage.setItem('ec-name', name); }, [name]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    if (!name.trim()) return setMessage('Enter your name first.');
    if (form.type === 'Work' && !form.jobNumber.trim()) return setMessage('Job number is required for worked time.');
    if (total <= 0) return setMessage('Check start and finish times.');
    try {
      await api('/api/timesheets', {
        method: 'POST',
        body: JSON.stringify({ employee: name.trim(), ...form, breakMinutes: Number(form.breakMinutes), totalHours: total }),
      });
      setMessage('Timesheet submitted for PM approval.');
      setForm((f) => ({ ...f, jobNumber: '', notes: '' }));
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not submit timesheet');
    }
  }

  async function action(id: string, actionName: 'pm-approve' | 'admin-approve' | 'reject') {
    if (!name.trim()) return setMessage('Enter your name first.');
    let reason = '';
    if (actionName === 'reject') reason = window.prompt('Reason for rejection?') || 'Rejected';
    try {
      await api(`/api/timesheets/${id}`, { method: 'PATCH', body: JSON.stringify({ action: actionName, by: name.trim(), reason }) });
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not update timesheet');
    }
  }

  const visibleEntries = role === 'staff' && name.trim()
    ? entries.filter((e) => e.employee.toLowerCase() === name.trim().toLowerCase())
    : entries;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-kicker">ELLIOT CONTROLS</div>
          <h1>Timesheets</h1>
        </div>
        <div className="status-pill">Shared web app</div>
      </header>

      <main className="page">
        <section className="identity card">
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Smith" /></label>
          <div className="role-switch">
            <button className={role === 'staff' ? 'active' : ''} onClick={() => setRole('staff')}>Staff</button>
            <button className={role === 'pm' ? 'active' : ''} onClick={() => setRole('pm')}>Project Manager</button>
            <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>Office Admin</button>
          </div>
        </section>

        {message && <div className="message">{message}</div>}

        {role === 'staff' && (
          <section className="card">
            <div className="section-head"><div><span className="eyebrow">NEW ENTRY</span><h2>Enter today's time</h2></div><strong>{total.toFixed(2)} hrs</strong></div>
            <form onSubmit={submit} className="form-grid">
              <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
              <label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as WorkType, breakMinutes: e.target.value === 'Work' ? 30 : 0 })}>{workTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
              {form.type === 'Work' && <label className="wide">Simpro job number *<input value={form.jobNumber} onChange={(e) => setForm({ ...form, jobNumber: e.target.value })} placeholder="Required" /></label>}
              <label>Start<input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
              <label>Finish<input type="time" value={form.finish} onChange={(e) => setForm({ ...form, finish: e.target.value })} /></label>
              <label>Break (minutes)<input type="number" min="0" max="240" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })} /></label>
              <label className="wide">Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></label>
              <button className="primary wide" type="submit">Submit timesheet</button>
            </form>
          </section>
        )}

        <section className="card">
          <div className="section-head"><div><span className="eyebrow">{role === 'staff' ? 'MY TIMESHEETS' : role === 'pm' ? 'PM APPROVAL QUEUE' : 'OFFICE ADMIN QUEUE'}</span><h2>{role === 'staff' ? 'Recent entries' : 'Review entries'}</h2></div><button className="ghost" onClick={refresh}>Refresh</button></div>
          {loading ? <p>Loading…</p> : visibleEntries.length === 0 ? <p className="muted">No timesheets yet.</p> : (
            <div className="entry-list">
              {visibleEntries.map((e) => (
                <article className="entry" key={e.id}>
                  <div className="entry-main">
                    <div className="entry-title"><strong>{e.employee}</strong><span className={`badge status-${e.status.toLowerCase().split(' ').join('-')}`}>{e.status}</span></div>
                    <div className="entry-meta"><span>{e.date}</span><span>{e.type}</span><span>{e.start}–{e.finish}</span><span>{e.totalHours.toFixed(2)} hrs</span></div>
                    {e.jobNumber && <div className="job">Job #{e.jobNumber}</div>}
                    {e.notes && <p>{e.notes}</p>}
                    {e.rejectionReason && <p className="rejected">Reason: {e.rejectionReason}</p>}
                    {e.status === 'Admin Approved' && <p className="simpro">Simpro: {e.simproStatus || 'Awaiting API connection'}</p>}
                  </div>
                  <div className="actions">
                    {role === 'pm' && e.status === 'Submitted' && <><button className="primary" onClick={() => action(e.id, 'pm-approve')}>PM approve</button><button className="danger" onClick={() => action(e.id, 'reject')}>Reject</button></>}
                    {role === 'admin' && e.status === 'PM Approved' && <><button className="primary" onClick={() => action(e.id, 'admin-approve')}>Final approve</button><button className="danger" onClick={() => action(e.id, 'reject')}>Reject</button></>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer>Pilot version • Shared Cloudflare storage • Simpro connection will be enabled after API credentials are added securely.</footer>
      </main>
    </div>
  );
}
