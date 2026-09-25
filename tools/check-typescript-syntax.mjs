import fs from 'node:fs';
import path from 'node:path';
import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js';

const root = process.argv[2] ?? 'backend/src';
const files=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(full);
    else if(/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
}
walk(root);
let failed=0;
for(const file of files){
  const source=fs.readFileSync(file,'utf8');
  const kind=file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS;
  const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,jsx:ts.JsxEmit.ReactJSX},fileName:file,reportDiagnostics:true,transformers:{}});
  const diagnostics=result.diagnostics??[];
  const errors=diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length){
    failed += errors.length;
    for(const d of errors) console.error(`${file}:${d.start??0} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`);
  }
}
console.log(`TypeScript transpile/syntax check: ${files.length} files scanned, ${failed} syntax errors`);
process.exitCode=failed?1:0;
