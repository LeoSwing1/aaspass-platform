import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const src=path.join(root,'backend','src');
const files=[]; const missing=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else if(f.endsWith('.ts'))files.push(f);}}
walk(src);
for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  for(const m of text.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)){
    const spec=m[1]; if(!spec) continue;
    const base=path.resolve(path.dirname(file),spec.replace(/\.js$/,''));
    const candidates=[base,base+'.ts',path.join(base,'index.ts')];
    if(!candidates.some(fs.existsSync)) missing.push(`${path.relative(root,file)} -> ${spec}`);
  }
}
console.log(`Relative import audit: ${files.length} files, ${missing.length} missing imports.`);
if(missing.length){for(const x of missing)console.error(x);process.exit(1);}
