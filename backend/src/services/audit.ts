import { query } from '../db/pool.js';
export async function audit(action:string,entityType:string,entityId:string|null,actorUserId:string|null,metadata:Record<string,unknown>={}):Promise<void>{
  if(!process.env.DATABASE_URL) return;
  await query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5)`,[actorUserId,action,entityType,entityId,metadata]);
}
