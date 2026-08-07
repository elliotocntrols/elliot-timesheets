import { Hono } from 'hono';

type Entry = {
  id: string;
  employee: string;
  date: string;
  type: string;
  jobNumber: string;
  start: string;
  finish: string;
  breakMinutes: number;
  totalHours: number;
  notes: string;
  status: 'Submitted' | 'PM Approved' | 'Admin Approved' | 'Rejected';
  pmApprovedBy?: string;
  adminApprovedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  simproStatus?: string;
};

type Bindings = Env & { TIMESHEET_STORE: DurableObjectNamespace };

export class TimesheetStore {
  constructor(private readonly state: DurableObjectState) {}

  private json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/timesheets') {
      const rows = await this.state.storage.list<Entry>({ prefix: 'entry:' });
      const entries = [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return this.json({ entries });
    }

    if (request.method === 'POST' && path === '/timesheets') {
      const body = await request.json<Record<string, unknown>>();
      const employee = String(body.employee || '').trim();
      const type = String(body.type || '');
      const jobNumber = String(body.jobNumber || '').trim();
      if (!employee) return this.json({ error: 'Employee name is required' }, 400);
      if (type === 'Work' && !jobNumber) return this.json({ error: 'Job number is required for worked time' }, 400);
      const id = crypto.randomUUID();
      const entry: Entry = {
        id,
        employee,
        date: String(body.date || ''),
        type,
        jobNumber,
        start: String(body.start || ''),
        finish: String(body.finish || ''),
        breakMinutes: Number(body.breakMinutes || 0),
        totalHours: Number(body.totalHours || 0),
        notes: String(body.notes || ''),
        status: 'Submitted',
        createdAt: new Date().toISOString(),
        simproStatus: 'Awaiting API connection',
      };
      await this.state.storage.put(`entry:${id}`, entry);
      return this.json({ entry }, 201);
    }

    if (request.method === 'PATCH' && path.startsWith('/timesheets/')) {
      const id = path.split('/').pop() || '';
      const entry = await this.state.storage.get<Entry>(`entry:${id}`);
      if (!entry) return this.json({ error: 'Timesheet not found' }, 404);
      const body = await request.json<Record<string, unknown>>();
      const action = String(body.action || '');
      const by = String(body.by || '').trim();
      const reason = String(body.reason || '').trim();
      if (!by) return this.json({ error: 'Approver name is required' }, 400);

      if (action === 'pm-approve') {
        if (entry.status !== 'Submitted') return this.json({ error: 'Only submitted entries can be PM approved' }, 409);
        entry.status = 'PM Approved';
        entry.pmApprovedBy = by;
      } else if (action === 'admin-approve') {
        if (entry.status !== 'PM Approved') return this.json({ error: 'PM approval is required first' }, 409);
        entry.status = 'Admin Approved';
        entry.adminApprovedBy = by;
        entry.simproStatus = 'Awaiting API connection';
      } else if (action === 'reject') {
        entry.status = 'Rejected';
        entry.rejectionReason = reason || 'Rejected';
      } else {
        return this.json({ error: 'Unknown action' }, 400);
      }

      await this.state.storage.put(`entry:${id}`, entry);
      return this.json({ entry });
    }

    return this.json({ error: 'Not found' }, 404);
  }
}

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/health', (c) => c.json({ ok: true, app: 'Elliot Controls Timesheets' }));
app.all('/api/*', async (c) => {
  const id = c.env.TIMESHEET_STORE.idFromName('elliot-controls-timesheets');
  const stub = c.env.TIMESHEET_STORE.get(id);
  const url = new URL(c.req.raw.url);
  url.pathname = url.pathname.replace(/^\/api/, '') || '/';
  const forwarded = new Request(url.toString(), {
    method: c.req.raw.method,
    headers: c.req.raw.headers,
    body: ['GET', 'HEAD'].includes(c.req.raw.method) ? undefined : c.req.raw.body,
  });
  return stub.fetch(forwarded);
});

export default app;
