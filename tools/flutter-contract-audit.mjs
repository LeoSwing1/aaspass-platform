import fs from 'node:fs';
import path from 'node:path';

const apps = ['customer', 'vendor', 'delivery-partner'];
let failures = 0;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.dart')) out.push(full);
  }
  return out;
}

for (const app of apps) {
  const root = path.join('apps', app);
  const files = walk(path.join(root, 'lib'));
  const pubspec = fs.readFileSync(path.join(root, 'pubspec.yaml'), 'utf8');
  const deps = new Set([...pubspec.matchAll(/^  ([A-Za-z0-9_]+):/gm)].map(m => m[1]));

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/import\s+['"]package:([^/]+)\//g)) {
      const pkg = match[1];
      if (pkg !== 'flutter' && !deps.has(pkg)) {
        console.error(`${file}: missing pubspec dependency for package:${pkg}`);
        failures++;
      }
    }
  }

  if (app === 'customer') {
    const api = fs.readFileSync(path.join(root, 'lib/core/api/aaspass_api.dart'), 'utf8');
    const methods = new Set([...api.matchAll(/(?:Future(?:<.*?>)?|dynamic|void|Map<.*?>|List<.*?>)\s+(\w+)\s*\(/g)].map(m => m[1]));
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/AasPassApi\.instance\.(\w+)\s*\(/g)) {
        if (!methods.has(match[1])) {
          console.error(`${file}: AasPassApi method not implemented: ${match[1]}`);
          failures++;
        }
      }
    }
    const main = fs.readFileSync(path.join(root, 'lib/main.dart'), 'utf8');
    if (main.includes('OnboardingScreen(') && !fs.existsSync(path.join(root, 'lib/features/onboarding/onboarding_screen.dart'))) {
      console.error('apps/customer: OnboardingScreen is referenced but its implementation is missing');
      failures++;
    }
  }
}

if (failures) process.exit(1);
console.log('Flutter contract audit: PASS');
