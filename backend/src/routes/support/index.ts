import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';
import { PERMISSIONS } from '../../types/permissions.js';
import { query } from '../../db/pool.js';
import { audit } from '../../services/audit.js';
import { queueNotification } from '../../services/notifications/service.js';
import type { Role } from '../../types/auth.js';

const router = Router();
router.use(requireAuth, requirePermission(PERMISSIONS.VIEW_SUPPORT));

const ticketStatuses = ['OPEN','IN_PROGRESS','WAITING_CUSTOMER','WAITING_VENDOR','WAITING_DELIVERY','RESOLVED','CLOSED'] as const;
const priorities = ['LOW','NORMAL','HIGH','URGENT'] as const;

const createTicket = z.object({
  subject: z.string().trim().min(5).max(255),
  description: z.string().trim().min(10).max(5000),
  orderId: z.string().uuid().optional(),
  priority: z.enum(priorities).default('NORMAL')
});

const updateTicket = z.object({
  status: z.enum(ticketStatuses).optional(),
  priority: z.enum(priorities).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

const messageSchema = z.object({ message: z.string().trim().min(1).max(5000) });

function canAccessAllTickets(role: Role) {
  return ['SUPER_ADMIN','ADMIN','SUPPORT_LEAD'].includes(role);
}

function normalizeIndianPhone(raw:string): string {
  const digits=raw.replace(/\D/g,'');
  return digits.startsWith('91') && digits.length > 10 ? digits.slice(-10) : digits.slice(-10);
}

function canLookupCustomer(role: Role) {
  return ['SUPER_ADMIN','ADMIN','SUPPORT_LEAD','SUPPORT_AGENT'].includes(role);
}


router.get('/customers/lookup', requirePermission(PERMISSIONS.VIEW_CUSTOMER_PROFILE), async (req,res,next)=>{ try {
  if(!canLookupCustomer(req.authUser!.role)){res.status(403).json({error:'FORBIDDEN'});return;}
  const raw=String(req.query.phone ?? '').trim();
  const phone=normalizeIndianPhone(raw);
  if(phone.length!==10){res.status(400).json({error:'INVALID_PHONE',message:'Enter a valid 10-digit Indian mobile number'});return;}
  const customer=await query(`
    SELECT u.id AS user_id, cp.customer_code, u.name, u.phone, u.email, u.is_active, u.created_at,
           cp.preferred_language, cp.marketing_opt_in, cp.last_active_at,
           COALESCE(stats.order_count,0)::int order_count,
           COALESCE(stats.active_order_count,0)::int active_order_count,
           COALESCE(stats.total_spend_paise,0)::bigint total_spend_paise,
           stats.last_order_at,
           COALESCE(tix.ticket_count,0)::int ticket_count,
           COALESCE(addr.address_count,0)::int address_count
    FROM users u JOIN customer_profiles cp ON cp.user_id=u.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int order_count,
             COUNT(*) FILTER (WHERE status NOT IN ('DELIVERED','CANCELLED','REFUNDED'))::int active_order_count,
             COALESCE(SUM(total_paise) FILTER (WHERE status NOT IN ('CANCELLED','REFUNDED')),0)::bigint total_spend_paise,
             MAX(created_at) last_order_at
      FROM orders WHERE customer_id=u.id
    ) stats ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*)::int ticket_count FROM support_tickets WHERE requester_user_id=u.id) tix ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*)::int address_count FROM addresses WHERE user_id=u.id) addr ON TRUE
    WHERE u.role='CUSTOMER' AND RIGHT(regexp_replace(u.phone,'\\D','','g'),10)=$1
    ORDER BY u.created_at DESC LIMIT 1
  `,[phone]);
  if(!customer.rows[0]){res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}
  const c=customer.rows[0] as any;
  const addresses=await query(`SELECT id,label,line1,line2,locality,city,state,postal_code,is_default,created_at FROM addresses WHERE user_id=$1 ORDER BY is_default DESC,updated_at DESC`,[c.user_id]);
  const orders=await query(`
    SELECT o.id,o.status,o.subtotal_paise,o.delivery_fee_paise,o.platform_fee_paise,o.platform_gst_paise,o.payment_processing_fee_paise,o.total_paise,o.currency,o.created_at,o.placed_at,v.name AS vendor_name,
           p.method AS payment_method,p.status AS payment_status,p.provider AS payment_provider
    FROM orders o JOIN vendors v ON v.id=o.vendor_id
    LEFT JOIN LATERAL (SELECT method,status,provider FROM payments WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) p ON TRUE
    WHERE o.customer_id=$1 ORDER BY o.created_at DESC LIMIT 50
  `,[c.user_id]);
  const support=await query(`SELECT id,subject,status,priority,order_id,created_at,updated_at FROM support_tickets WHERE requester_user_id=$1 ORDER BY updated_at DESC LIMIT 50`,[c.user_id]);
  const activeOrder=await query(`
    SELECT o.id,o.status,o.total_paise,o.created_at,v.name vendor_name,
           da.id assignment_id,da.status delivery_status,da.delivery_partner_id,da.earning_paise
    FROM orders o JOIN vendors v ON v.id=o.vendor_id
    LEFT JOIN delivery_assignments da ON da.order_id=o.id
    WHERE o.customer_id=$1 AND o.status NOT IN ('DELIVERED','CANCELLED','REFUNDED')
    ORDER BY o.created_at DESC LIMIT 5
  `,[c.user_id]);
  const cart=await query(`
    SELECT cc.vendor_id,COALESCE(SUM(ci.quantity),0)::int item_count,COUNT(ci.id)::int line_count
    FROM customer_carts cc LEFT JOIN cart_items ci ON ci.cart_id=cc.id WHERE cc.customer_id=$1 GROUP BY cc.vendor_id
  `,[c.user_id]);
  const devices=await query(`SELECT COUNT(*) FILTER (WHERE is_active=true)::int active_tokens,ARRAY_AGG(DISTINCT platform) FILTER (WHERE is_active=true) platforms FROM device_tokens WHERE user_id=$1`,[c.user_id]);
  await audit('SUPPORT_CUSTOMER_PROFILE_LOOKUP','users',c.user_id,req.authUser!.id,{phoneLast4:phone.slice(-4),requestId:req.requestId});
  res.json({customer:c,addresses:addresses.rows,orders:orders.rows,activeOrders:activeOrder.rows,supportTickets:support.rows,cart:cart.rows[0]??{vendor_id:null,item_count:0,line_count:0},devices:devices.rows[0]??{active_tokens:0,platforms:[]},mode:'database'});
 }catch(e){next(e);} });

router.get('/customers/:customerId', requirePermission(PERMISSIONS.VIEW_CUSTOMER_PROFILE), async (req,res,next)=>{ try {
  if(!canLookupCustomer(req.authUser!.role)){res.status(403).json({error:'FORBIDDEN'});return;}
  const customerId=z.string().min(5).max(64).parse(req.params.customerId);
  const match=await query<{user_id:string}>(`SELECT user_id FROM customer_profiles WHERE customer_code=$1 LIMIT 1`,[customerId]);
  if(!match.rows[0]){res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}
  const phone=await query<{phone:string|null}>(`SELECT phone FROM users WHERE id=$1 LIMIT 1`,[match.rows[0].user_id]);
  req.query.phone=phone.rows[0]?.phone??'';
  if(!req.query.phone){res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}
  // Re-use the same lookup contract through the identifier lookup route's query shape.
  const raw=String(req.query.phone); const digits=raw.replace(/\D/g,'').slice(-10);
  const customer=await query(`SELECT u.id AS user_id,cp.customer_code,u.name,u.phone,u.email,u.is_active,u.created_at,cp.preferred_language,cp.marketing_opt_in,cp.last_active_at FROM users u JOIN customer_profiles cp ON cp.user_id=u.id WHERE cp.customer_code=$1 LIMIT 1`,[customerId]);
  if(!customer.rows[0]){res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}
  const c:any=customer.rows[0];
  const [addresses,orders,support,activeOrder]=await Promise.all([
    query(`SELECT id,label,line1,line2,locality,city,state,postal_code,is_default,created_at FROM addresses WHERE user_id=$1 ORDER BY is_default DESC,updated_at DESC`,[c.user_id]),
    query(`SELECT o.id,o.status,o.subtotal_paise,o.delivery_fee_paise,o.platform_fee_paise,o.platform_gst_paise,o.payment_processing_fee_paise,o.total_paise,o.currency,o.created_at,o.placed_at,v.name AS vendor_name,p.method AS payment_method,p.status AS payment_status,p.provider AS payment_provider FROM orders o JOIN vendors v ON v.id=o.vendor_id LEFT JOIN LATERAL (SELECT method,status,provider FROM payments WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) p ON TRUE WHERE o.customer_id=$1 ORDER BY o.created_at DESC LIMIT 50`,[c.user_id]),
    query(`SELECT id,subject,status,priority,order_id,created_at,updated_at FROM support_tickets WHERE requester_user_id=$1 ORDER BY updated_at DESC LIMIT 50`,[c.user_id]),
    query(`SELECT o.id,o.status,o.total_paise,o.created_at,v.name vendor_name,da.status delivery_status FROM orders o JOIN vendors v ON v.id=o.vendor_id LEFT JOIN delivery_assignments da ON da.order_id=o.id WHERE o.customer_id=$1 AND o.status NOT IN ('DELIVERED','CANCELLED','REFUNDED') ORDER BY o.created_at DESC LIMIT 5`,[c.user_id])
  ]);
  await audit('SUPPORT_CUSTOMER_PROFILE_LOOKUP','users',c.user_id,req.authUser!.id,{customerCode:c.customer_code,phoneLast4:digits.slice(-4),requestId:req.requestId});
  res.json({customer:c,addresses:addresses.rows,orders:orders.rows,activeOrders:activeOrder.rows,supportTickets:support.rows,mode:'database'});
 }catch(e){next(e);} });

router.get('/agents', requireRoles('SUPER_ADMIN','ADMIN','SUPPORT_LEAD'), async (_req,res,next)=>{try{
  const r=await query(`SELECT id,name,phone,role FROM users WHERE role IN ('SUPPORT_AGENT','SUPPORT_LEAD') AND is_active=true ORDER BY role,name`);
  res.json({agents:r.rows});
}catch(e){next(e)}});

router.get('/', async (req, res, next) => {
  try {
    const role = req.authUser!.role;
    const params: unknown[] = [];
    let where = '';
    if (!canAccessAllTickets(role)) {
      params.push(req.authUser!.id);
      where = `WHERE t.requester_user_id = $1 OR t.assigned_to = $1`;
    }
    const result = await query(`
      SELECT t.id, t.subject, t.description, t.status, t.priority, t.requester_user_id,
             t.order_id, t.assigned_to, t.created_at, t.updated_at,
             requester.name AS requester_name, requester.phone AS requester_phone,
             assignee.name AS assignee_name
      FROM support_tickets t
      JOIN users requester ON requester.id = t.requester_user_id
      LEFT JOIN users assignee ON assignee.id = t.assigned_to
      ${where}
      ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
               t.updated_at DESC
      LIMIT 200
    `, params);
    res.json({ tickets: result.rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const input = createTicket.parse(req.body);
    const result = await query<{id:string}>(`
      INSERT INTO support_tickets(requester_user_id, order_id, subject, description, status, priority)
      VALUES($1,$2,$3,$4,'OPEN',$5) RETURNING id
    `,[req.authUser!.id, input.orderId ?? null, input.subject, input.description, input.priority]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Ticket creation failed');
    await query(`INSERT INTO support_ticket_events(ticket_id,actor_user_id,event_type,payload) VALUES($1,$2,'CREATED',$3)`,[id,req.authUser!.id,JSON.stringify({priority:input.priority})]);
    await audit('SUPPORT_TICKET_CREATED','support_tickets',id,req.authUser!.id,{priority:input.priority,orderId:input.orderId ?? null});
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const ticketId = z.string().uuid().parse(req.params.id);
    const ticket = await query(`
      SELECT t.id, t.subject, t.description, t.status, t.priority, t.requester_user_id,
             t.order_id, t.assigned_to, t.created_at, t.updated_at,
             requester.name AS requester_name, requester.phone AS requester_phone,
             assignee.name AS assignee_name
      FROM support_tickets t
      JOIN users requester ON requester.id=t.requester_user_id
      LEFT JOIN users assignee ON assignee.id=t.assigned_to
      WHERE t.id=$1
    `,[ticketId]);
    if (!ticket.rows[0]) { res.status(404).json({error:'NOT_FOUND'}); return; }
    const row = ticket.rows[0] as {requester_user_id:string;assigned_to:string|null};
    if (!canAccessAllTickets(req.authUser!.role) && row.requester_user_id !== req.authUser!.id && row.assigned_to !== req.authUser!.id) {
      res.status(403).json({error:'FORBIDDEN'}); return;
    }
    const messages = await query(`
      SELECT m.id,m.sender_user_id,m.message,m.is_internal,m.created_at,u.name AS sender_name,u.role AS sender_role
      FROM support_ticket_messages m JOIN users u ON u.id=m.sender_user_id
      WHERE m.ticket_id=$1 ORDER BY m.created_at ASC
    `,[ticketId]);
    const events = await query(`
      SELECT e.id,e.event_type,e.payload,e.created_at,u.name AS actor_name,u.role AS actor_role
      FROM support_ticket_events e LEFT JOIN users u ON u.id=e.actor_user_id
      WHERE e.ticket_id=$1 ORDER BY e.created_at DESC LIMIT 100
    `,[ticketId]);
    let order = null;
    if (row && (ticket.rows[0] as any).order_id) {
      const orderResult = await query(`
        SELECT o.id,o.status,o.total_paise,o.delivery_fee_paise,o.platform_fee_paise,o.platform_gst_paise,o.created_at,
               v.name AS vendor_name
        FROM orders o LEFT JOIN vendors v ON v.id=o.vendor_id WHERE o.id=$1
      `,[(ticket.rows[0] as any).order_id]);
      order = orderResult.rows[0] ?? null;
    }
    res.json({ticket:ticket.rows[0],messages:messages.rows,events:events.rows,order});
  } catch (e) { next(e); }
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    const ticketId = z.string().uuid().parse(req.params.id);
    const input = messageSchema.parse(req.body);
    const ticket = await query(`SELECT requester_user_id,assigned_to FROM support_tickets WHERE id=$1`,[ticketId]);
    const row=ticket.rows[0] as {requester_user_id:string;assigned_to:string|null}|undefined;
    if(!row){res.status(404).json({error:'NOT_FOUND'});return;}
    if(!canAccessAllTickets(req.authUser!.role) && row.requester_user_id!==req.authUser!.id && row.assigned_to!==req.authUser!.id){res.status(403).json({error:'FORBIDDEN'});return;}
    const result=await query<{id:string}>(`INSERT INTO support_ticket_messages(ticket_id,sender_user_id,message,is_internal) VALUES($1,$2,$3,FALSE) RETURNING id`,[ticketId,req.authUser!.id,input.message]);
    await query(`UPDATE support_tickets SET status=CASE WHEN status='OPEN' THEN 'IN_PROGRESS' ELSE status END,updated_at=NOW() WHERE id=$1`,[ticketId]);
    await audit('SUPPORT_MESSAGE_SENT','support_tickets',ticketId,req.authUser!.id,{});
    await queueNotification({userId:row.requester_user_id,channel:'PUSH',title:'AasPass Support replied',body:`A support agent replied to your ticket: ${String(ticketId).slice(0,8)}…`,data:{type:'SUPPORT',ticketId}});
    res.status(201).json({id:result.rows[0]?.id});
  }catch(e){next(e);}
});

router.patch('/:id', requireRoles('SUPER_ADMIN','ADMIN','SUPPORT_LEAD','SUPPORT_AGENT'), async (req, res, next) => {
  try {
    if (req.authUser!.role === 'SUPPORT_AGENT' && req.body.assignedTo) { res.status(403).json({error:'FORBIDDEN',message:'Support agents cannot reassign tickets'}); return; }
    const ticketId = z.string().uuid().parse(req.params.id);
    const input = updateTicket.parse(req.body);
    const current=await query(`SELECT status,priority,assigned_to FROM support_tickets WHERE id=$1`,[ticketId]);
    if(!current.rows[0]){res.status(404).json({error:'NOT_FOUND'});return;}
    const setParts:string[]=[]; const params:unknown[]=[]; let i=1;
    if(input.status){setParts.push(`status=$${i++}`);params.push(input.status);}
    if(input.priority){setParts.push(`priority=$${i++}`);params.push(input.priority);}
    if(input.assignedTo!==undefined){setParts.push(`assigned_to=$${i++}`);params.push(input.assignedTo);}
    if(!setParts.length){res.json({ok:true});return;}
    params.push(ticketId);
    await query(`UPDATE support_tickets SET ${setParts.join(',')},updated_at=NOW() WHERE id=$${i}` ,params);
    await query(`INSERT INTO support_ticket_events(ticket_id,actor_user_id,event_type,payload) VALUES($1,$2,'UPDATED',$3)`,[ticketId,req.authUser!.id,JSON.stringify(input)]);
    await audit('SUPPORT_TICKET_UPDATED','support_tickets',ticketId,req.authUser!.id,input as Record<string,unknown>);
    const requester=await query<{requester_user_id:string}>(`SELECT requester_user_id FROM support_tickets WHERE id=$1`,[ticketId]);
    if(requester.rows[0]?.requester_user_id){
      await queueNotification({userId:requester.rows[0].requester_user_id,channel:'PUSH',title:'AasPass Support updated your ticket',body:`Ticket ${String(ticketId).slice(0,8)}… is now ${input.status ?? 'updated'}.`,data:{type:'SUPPORT',ticketId,status:input.status ?? ''}});
    }
    res.json({ok:true});
  } catch(e){next(e);}
});

router.post('/:id/internal-note', requireRoles('SUPER_ADMIN','ADMIN','SUPPORT_LEAD','SUPPORT_AGENT'), async (req,res,next)=>{
  try{
    const ticketId=z.string().uuid().parse(req.params.id); const input=messageSchema.parse(req.body);
    const result=await query<{id:string}>(`INSERT INTO support_ticket_messages(ticket_id,sender_user_id,message,is_internal) VALUES($1,$2,$3,TRUE) RETURNING id`,[ticketId,req.authUser!.id,input.message]);
    await query(`INSERT INTO support_ticket_events(ticket_id,actor_user_id,event_type,payload) VALUES($1,$2,'INTERNAL_NOTE',$3)`,[ticketId,req.authUser!.id,JSON.stringify({messageId:result.rows[0]?.id})]);
    res.status(201).json({id:result.rows[0]?.id});
  }catch(e){next(e);}
});

export default router;
