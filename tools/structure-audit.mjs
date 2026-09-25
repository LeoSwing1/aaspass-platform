import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const required = [
  'apps/admin','apps/customer','apps/support','apps/vendor','apps/delivery-partner',
  'backend/src','database','packages','assets/branding','docs'
];
const requiredFiles = [
  'backend/src/server.ts','backend/src/routes/auth.ts','backend/src/routes/customer.ts',
  'backend/src/routes/admin.ts','backend/src/routes/vendor/index.ts','backend/src/routes/delivery.ts',
  'backend/src/routes/support/index.ts','backend/src/routes/integrations/index.ts',
  'database/schema.sql','database/seed.sql'
];
const failures=[];
for (const p of required) { try { if(!(await stat(join(root,p))).isDirectory()) failures.push(`Not a directory: ${p}`); } catch { failures.push(`Missing directory: ${p}`); } }
for (const p of requiredFiles) { try { if(!(await stat(join(root,p))).isFile()) failures.push(`Not a file: ${p}`); } catch { failures.push(`Missing file: ${p}`); } }
try { await stat(join(root,'AasPass-Master-v1.8')); failures.push('Unexpected nested AasPass-Master-v1.8 directory'); } catch {}
console.log(`AasPass structure audit: ${failures.length ? 'FAIL' : 'PASS'}`);
for (const f of failures) console.error(` - ${f}`);
process.exitCode = failures.length ? 1 : 0;
