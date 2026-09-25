import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');

const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = path.join(root, 'backend', 'src');
const files = [];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(full);
    else if(full.endsWith('.ts') || full.endsWith('.tsx')) files.push(full);
  }
}
walk(src);
let errors=0;
for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  const result=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext},reportDiagnostics:true,fileName:file});
  const diagnostics=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(diagnostics.length){
    errors += diagnostics.length;
    console.error(file, diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' | '));
  }
}
console.log(`Block 11 transpile scan: ${files.length} TS/TSX files, ${errors} syntax diagnostics.`);
if(errors) process.exit(1);
