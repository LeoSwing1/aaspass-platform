'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_AASPASS_API_BASE_URL || 'http://localhost:4100/api/v1';

type Ticket = {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  requester_name: string;
  requester_phone?: string;
  order_id?: string | null;
  assigned_to?: string | null;
  assignee_name?: string | null;
  created_at: string;
  updated_at: string;
};

type Customer360 = {
  customer: {
    user_id: string;
    customer_code: string;
    name: string;
    phone: string;
    email?: string | null;
    is_active: boolean;
    created_at: string;
    order_count: number;
    active_order_count: number;
    total_spend_paise: number;
    last_order_at?: string | null;
    ticket_count: number;
    address_count: number;
  };
  addresses: Array<{
    id: string;
    label?: string | null;
    line1: string;
    line2?: string | null;
    locality?: string | null;
    city: string;
    state: string;
    postal_code: string;
    is_default: boolean;
  }>;
  orders: Array<{
    id: string;
    status: string;
    total_paise: number;
    vendor_name: string;
    created_at: string;
    payment_method?: string | null;
    payment_status?: string | null;
  }>;
  activeOrders: Array<{
    id: string;
    status: string;
    total_paise: number;
    vendor_name: string;
    delivery_status?: string | null;
  }>;
  supportTickets: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    order_id?: string | null;
    updated_at: string;
  }>;
  cart?: { item_count?: number; line_count?: number };
  devices?: { active_tokens?: number; platforms?: string[] | null };
};

type Detail = {
  ticket: Ticket;
  messages: Array<{
    id: string;
    sender_name: string;
    sender_role: string;
    message: string;
    is_internal: boolean;
    created_at: string;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    actor_name?: string;
    created_at: string;
  }>;
  order?: {
    id: string;
    status: string;
    total_paise: number;
    platform_fee_paise: number;
    platform_gst_paise: number;
    vendor_name: string;
    created_at: string;
  } | null;
};


const money = (paise: number) => `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;
const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function Badge({ children }: { children?: any }) {
  const c = children === 'URGENT' ? 'urgent' : children === 'HIGH' ? 'high' : ['OPEN', 'IN_PROGRESS'].includes(children) ? 'open' : '';
  return <span className={`pill ${c}`}>{children.replaceAll('_', ' ')}</span>;
}

async function authFetch(path: string, init?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('aaspass_access_token') : null;
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function Login({onLogin}:{onLogin:()=>void}){
  const [phone,setPhone]=useState(''); const [otp,setOtp]=useState(''); const [sent,setSent]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const submit=async()=>{setError('');const p=phone.replace(/\D/g,'');if(p.length!==10){setError('Enter a valid 10-digit support mobile number.');return;}if(!sent){setSent(true);return;}if(otp.length!==6){setError('Enter the 6-digit OTP.');return;}setBusy(true);try{const r=await fetch(`${API}/auth/dev/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:p,otp,role:'SUPPORT_AGENT',name:'AasPass Support Agent'})});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error||'Authentication failed');localStorage.setItem('aaspass_access_token',d.accessToken); localStorage.setItem('aaspass_support_user',JSON.stringify(d.user)); onLogin();}catch(e){setError(e instanceof Error?e.message:'Authentication failed.')}finally{setBusy(false)}};
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'linear-gradient(135deg,#eef8f3,#f7faf8)'}}><div className="card" style={{width:'100%',maxWidth:430,padding:30}}><div className="brand"><img src="/branding/AasPass-LOGO.png" alt="AasPass"/><div><b>AasPass Support</b><span>Connected customer operations</span></div></div><h1 style={{fontSize:28,margin:'8px 0'}}>Support login</h1><p className="subtitle">Sign in through the same AasPass identity service used by the support API.</p><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Support mobile number" inputMode="tel" maxLength={10}/>{sent&&<input value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} placeholder="6-digit OTP" inputMode="numeric" maxLength={6} style={{marginTop:10}}/>}<button className="btn primary" style={{width:'100%',marginTop:12}} disabled={busy} onClick={()=>void submit()}>{busy?'Signing in…':sent?'Verify support session':'Send OTP'}</button>{sent&&<div className="subtitle" style={{marginTop:8}}>Development authentication uses the backend-configured OTP.</div>}{error&&<div style={{marginTop:10,color:'#a64c47'}}>{error}</div>}</div></div>;
}

export default function Page() {
  const [authed, setAuthed] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [phone, setPhone] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customer, setCustomer] = useState<Customer360 | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'queue' | 'analytics' | 'settings'>('queue');
  const [agents, setAgents] = useState<Array<{id:string;name:string;phone:string;role:string}>>([]);
  const [currentRole, setCurrentRole] = useState('SUPPORT_AGENT');

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 2400);
  };

  const loadAgents = async () => {
    try {
      const r = await authFetch('/support/agents');
      if (r.ok) { const data = await r.json(); setAgents(Array.isArray(data.agents) ? data.agents : []); }
    } catch { setAgents([]); }
  };

  const load = async () => {
    try {
      const r = await authFetch('/support');
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data.tickets) && data.tickets.length) {
        setTickets(data.tickets);
        setSelected(data.tickets[0].id);
      }
    } catch {
      setTickets([]);
    }
  };

  const loadDetail = async (id: string) => {
    if (!id) return;
    try {
      const r = await authFetch(`/support/${id}`);
      if (!r.ok) return;
      setDetail(await r.json());
    } catch {
      setDetail(null);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('aaspass_access_token');
    const raw = localStorage.getItem('aaspass_support_user');
    if (raw) { try { const user = JSON.parse(raw); if (user?.role) setCurrentRole(user.role); } catch {} }
    setAuthed(Boolean(token));
  }, []);

  useEffect(() => {
    if (authed) { void load(); void loadAgents(); }
  }, [authed]);

  useEffect(() => {
    void loadDetail(selected);
  }, [selected]);

  const visible = useMemo(
    () => tickets.filter((t) => (filter === 'ALL' || t.status === filter) && `${t.subject} ${t.requester_name} ${t.id}`.toLowerCase().includes(search.toLowerCase())),
    [tickets, filter, search],
  );

  const counts = useMemo(
    () => ({
      open: tickets.filter((t) => ['OPEN', 'IN_PROGRESS'].includes(t.status)).length,
      urgent: tickets.filter((t) => t.priority === 'URGENT').length,
      resolved: tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status)).length,
    }),
    [tickets],
  );

  const lookupCustomer = async () => {
    const id = customerId.trim().toUpperCase();
    const digits = phone.replace(/\D/g, '');
    if (!id && digits.length < 10) {
      flash('Enter a Customer ID or registered mobile number.');
      return;
    }
    setLoadingCustomer(true);
    try {
      const path = id ? `/support/customers/${encodeURIComponent(id)}` : `/support/customers/lookup?phone=${encodeURIComponent(digits)}`;
      const r = await authFetch(path);
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || data.error || 'Customer not found');
      setCustomer(data);
      flash(`Customer ${data.customer.customer_code} loaded.`);
    } catch (error) {
      setCustomer(null);
      flash(error instanceof Error ? error.message : 'Customer not found.');
    } finally {
      setLoadingCustomer(false);
    }
  };

  const assignTicket = async (assignedTo: string) => {
    if (!detail) return;
    try {
      const r = await authFetch(`/support/${detail.ticket.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assignedTo: assignedTo || null }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || data.error || 'Assignment failed');
      flash(assignedTo ? 'Ticket assigned.' : 'Ticket unassigned.');
      await load();
      await loadDetail(detail.ticket.id);
    } catch (error) { flash(error instanceof Error ? error.message : 'Assignment failed.'); }
  };

  const updateStatus = async (status: string) => {
    if (!detail) return;
    setDetail({ ...detail, ticket: { ...detail.ticket, status } });
    flash(`Ticket updated to ${status.toLowerCase().replaceAll('_', ' ')}.`);
    await authFetch(`/support/${detail.ticket.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  };

  const send = async (internal: boolean) => {
    if (!detail || !message.trim()) return;
    const path = internal ? 'internal-note' : 'messages';
    const text = message.trim();
    await authFetch(`/support/${detail.ticket.id}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    setMessage('');
    flash(internal ? 'Internal note added.' : 'Reply sent.');
    await loadDetail(detail.ticket.id);
  };

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <img src="/branding/AasPass-LOGO.png" alt="AasPass" />
          <div><b>AasPass Support</b><span>Web Operations Console</span></div>
        </div>
        <div className="nav">
          <button className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>◈ <span>Tickets</span></button>
          <button className={tab === 'analytics' ? 'active' : ''} onClick={() => setTab('analytics')}>◒ <span>Analytics</span></button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>⚙ <span>Settings</span></button>
        </div>
        <div className="operator"><strong><span className="statusDot" /> Leo Swing</strong><span>Founder / Super Admin</span></div>
      </aside>

      <main className="main">
        <header className="top">
          <div>
            <div className="eyebrow">AASPASS • SUPPORT COMMAND</div>
            <div className="title">Customer 360 + issue resolution</div>
            <p className="subtitle">Find a customer by registered mobile, then work every support issue from the same web console.</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => { void load(); if (selected) void loadDetail(selected); }}>Refresh</button>
            <button className="btn primary" onClick={() => flash('New ticket composer ready.')}>＋ New ticket</button>
          </div>
        </header>

        {notice && <div className="card" style={{ padding: 12, marginBottom: 16 }}>{notice}</div>}

        {tab === 'queue' && (
          <>
            <section className="card" style={{ marginBottom: 16 }}>
              <div className="cardHead">
                <div>
                  <h3>Customer 360 lookup</h3>
                  <p className="subtitle">Search by the registered mobile number. The lookup is permission-gated and audited.</p>
                </div>
                <span className="pill">Customer profile</span>
              </div>
              <div className="cardBody">
                <div className="actions">
                  <input style={{ flex: 1, minWidth: 220 }} value={customerId} onChange={(e) => setCustomerId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void lookupCustomer(); }} placeholder="Customer ID e.g. AAS-CUS-000001" />
                  <input style={{ flex: 1, minWidth: 220 }} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void lookupCustomer(); }} placeholder="or registered mobile" />
                  <button className="btn primary" disabled={loadingCustomer} onClick={() => void lookupCustomer()}>{loadingCustomer ? 'Looking up…' : 'Lookup customer'}</button>
                </div>

                {customer && (
                  <div style={{ marginTop: 16 }}>
                    <div className="grid4">
                      <div className="kpi"><small>Customer ID</small><div className="num" style={{ fontSize: 20 }}>{customer.customer.customer_code}</div><small>{customer.customer.is_active ? 'Active' : 'Inactive'}</small></div>
                      <div className="kpi"><small>Orders</small><div className="num">{customer.customer.order_count}</div><small>{customer.customer.active_order_count} active</small></div>
                      <div className="kpi"><small>Order value</small><div className="num" style={{ fontSize: 24 }}>{money(customer.customer.total_spend_paise)}</div><small>Non-refunded orders</small></div>
                      <div className="kpi"><small>Support</small><div className="num">{customer.customer.ticket_count}</div><small>{customer.customer.address_count} addresses</small></div>
                    </div>

                    <div className="body" style={{ marginTop: 16 }}>
                      <div className="card">
                        <div className="cardHead"><h3>Customer profile</h3></div>
                        <div className="cardBody">
                          <div className="row"><div><div className="label">Name</div><div className="value"><b>{customer.customer.name}</b></div></div><div><div className="label">Registered mobile</div><div className="value">{customer.customer.phone}</div></div></div>
                          <div className="row" style={{ marginTop: 14 }}><div><div className="label">Email</div><div className="value">{customer.customer.email || 'Not provided'}</div></div><div><div className="label">Customer ID</div><div className="value"><b>{customer.customer.customer_code}</b></div></div></div>
                        </div>
                      </div>

                      <div className="card">
                        <div className="cardHead"><h3>Recent orders</h3></div>
                        <div className="cardBody">
                          {customer.orders.slice(0, 8).map((order) => (
                            <div className="row" key={order.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                              <div><b>{order.vendor_name}</b><div className="subtitle">{order.id} · {fmt(order.created_at)}</div></div>
                              <div className="meta"><span className="pill">{order.status}</span><span className="pill">{money(order.total_paise)}</span></div>
                            </div>
                          ))}
                          {!customer.orders.length && <div className="empty">No orders yet.</div>}
                        </div>
                      </div>
                    </div>

                    <div className="body" style={{ marginTop: 16 }}>
                      <div className="card">
                        <div className="cardHead"><h3>Saved addresses</h3></div>
                        <div className="cardBody">
                          {customer.addresses.map((address) => (
                            <div key={address.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                              <b>{address.label || 'Address'}{address.is_default ? ' · Default' : ''}</b>
                              <div className="subtitle">{[address.line1, address.line2, address.locality, address.city, address.state, address.postal_code].filter(Boolean).join(', ')}</div>
                            </div>
                          ))}
                          {!customer.addresses.length && <div className="empty">No saved addresses.</div>}
                        </div>
                      </div>

                      <div className="card">
                        <div className="cardHead"><h3>Support history</h3></div>
                        <div className="cardBody">
                          {customer.supportTickets.slice(0, 8).map((ticket) => (
                            <div className="row" key={ticket.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                              <div><b>{ticket.subject}</b><div className="subtitle">{ticket.id} · {fmt(ticket.updated_at)}</div></div>
                              <div className="meta"><Badge>{ticket.status}</Badge><Badge>{ticket.priority}</Badge></div>
                            </div>
                          ))}
                          {!customer.supportTickets.length && <div className="empty">No support history.</div>}
                        </div>
                      </div>
                    </div>

                    <div className="card" style={{ marginTop: 16 }}>
                      <div className="cardHead"><h3>Live customer context</h3></div>
                      <div className="cardBody">
                        <div className="row"><span>Active delivery/order records</span><b>{customer.activeOrders.length}</b></div>
                        <div className="row" style={{ marginTop: 10 }}><span>Cart items</span><b>{customer.cart?.item_count || 0}</b></div>
                        <div className="row" style={{ marginTop: 10 }}><span>Registered active devices</span><b>{customer.devices?.active_tokens || 0}</b></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="grid4">
              <div className="kpi"><small>Open & active</small><div className="num">{counts.open}</div><small>Across all queues</small></div>
              <div className="kpi"><small>Urgent</small><div className="num">{counts.urgent}</div><small>Needs immediate action</small></div>
              <div className="kpi"><small>Resolved / closed</small><div className="num">{counts.resolved}</div><small>Current loaded set</small></div>
              <div className="kpi"><small>Target SLA</small><div className="num">&lt; 15m</div><small>First response target</small></div>
            </section>

            <section className="body">
              <div className="card">
                <div className="cardHead"><h3>Ticket queue</h3><div className="filters"><input placeholder="Search tickets…" value={search} onChange={(e) => setSearch(e.target.value)} /><select value={filter} onChange={(e) => setFilter(e.target.value)}><option>ALL</option><option>OPEN</option><option>IN_PROGRESS</option><option>WAITING_CUSTOMER</option><option>WAITING_VENDOR</option><option>WAITING_DELIVERY</option><option>RESOLVED</option><option>CLOSED</option></select></div></div>
                <div className="cardBody">
                  {visible.map((ticket) => (
                    <button key={ticket.id} className="ticket" onClick={() => setSelected(ticket.id)} style={{ width: '100%', background: 'transparent', border: 0, color: 'inherit', textAlign: 'left' }}>
                      <div className="avatar">{ticket.requester_name.slice(0, 1)}</div>
                      <div><h4>{ticket.subject}</h4><p>{ticket.requester_name} · {ticket.id} · Updated {fmt(ticket.updated_at)}</p><div className="meta"><Badge>{ticket.status}</Badge><Badge>{ticket.priority}</Badge>{ticket.order_id && <span className="pill">Order linked</span>}</div></div>
                      <div className="meta">{ticket.assignee_name ? <span className="pill">{ticket.assignee_name}</span> : <span className="pill">Unassigned</span>}</div>
                    </button>
                  ))}
                  {!visible.length && <div className="empty">No tickets match this view.</div>}
                </div>
              </div>

              <div className="detail">
                {detail ? (
                  <>
                    <div className="card">
                      <div className="cardHead"><h3>{detail.ticket.id}</h3><div className="meta"><Badge>{detail.ticket.status}</Badge><Badge>{detail.ticket.priority}</Badge></div></div>
                      <div className="cardBody"><div className="row"><div><div className="label">Requester</div><div className="value"><b>{detail.ticket.requester_name}</b><br />{detail.ticket.requester_phone || 'Phone unavailable'}</div></div><div style={{ textAlign: 'right' }}><div className="label">Assigned</div><div className="value">{detail.ticket.assignee_name || 'Unassigned'}</div></div></div>{currentRole === 'SUPPORT_LEAD' && agents.length > 0 && <div style={{ marginTop: 14 }}><div className="label">Route ticket</div><select value={detail.ticket.assigned_to || ''} onChange={(e) => void assignTicket(e.target.value)} style={{ width: '100%', marginTop: 6 }}><option value="">Unassigned</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.role}</option>)}</select></div>}<div style={{ marginTop: 18 }}><div className="label">Issue</div><div className="value" style={{ lineHeight: 1.55 }}><b>{detail.ticket.subject}</b><br />{detail.ticket.description}</div></div></div>
                    </div>
                    {detail.order && <div className="orderBox"><div className="label">Linked order</div><strong>{detail.order.id}</strong><div className="meta"><span className="pill">{detail.order.vendor_name}</span><span className="pill">{detail.order.status}</span><span className="pill">{money(detail.order.total_paise)}</span><span className="pill">GST {money(detail.order.platform_gst_paise)}</span></div></div>}
                    <div className="card">
                      <div className="cardHead"><h3>Conversation & events</h3><div className="meta"><button className="btn" onClick={() => void updateStatus('IN_PROGRESS')}>Take</button><button className="btn" onClick={() => void updateStatus('WAITING_CUSTOMER')}>Waiting</button><button className="btn primary" onClick={() => void updateStatus('RESOLVED')}>Resolve</button></div></div>
                      <div className="cardBody"><div className="timeline">{detail.messages.map((item) => <div className={`msg ${item.is_internal ? 'internal' : ''}`} key={item.id}><div className="head"><span>{item.sender_name} · {item.sender_role}</span><span>{fmt(item.created_at)}</span></div><p>{item.message}</p></div>)}{detail.events.slice(0, 6).map((event) => <div className="event" key={event.id}><div className="head"><span>Event · {event.event_type}</span><span>{fmt(event.created_at)}</span></div><p>{event.actor_name || 'System'}</p></div>)}</div><div className="composer" style={{ marginTop: 14 }}><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a clear response or internal action note…" /><div className="actions"><button className="btn" onClick={() => void send(true)}>Internal note</button><button className="btn primary" onClick={() => void send(false)}>Send reply</button></div></div></div>
                    </div>
                  </>
                ) : <div className="card"><div className="empty">Select a ticket.</div></div>}
              </div>
            </section>
          </>
        )}

        {tab === 'analytics' && <div className="body"><div className="card"><div className="cardHead"><h3>Support intelligence</h3></div><div className="cardBody"><p className="subtitle">Track first-response time, resolution time, reopen rate, escalation rate and refund-request aging by queue, customer and city.</p></div></div></div>}
        {tab === 'settings' && <div className="card"><div className="cardHead"><h3>Support controls</h3></div><div className="cardBody"><div className="row"><span>Customer 360 lookup</span><span className="pill open">Permission gated + audited</span></div><div className="row" style={{ marginTop: 14 }}><span>Internal notes</span><span className="pill open">Enabled</span></div><div className="row" style={{ marginTop: 14 }}><span>Audit trail</span><span className="pill open">Enabled</span></div></div></div>}
      </main>
    </div>
  );
}
