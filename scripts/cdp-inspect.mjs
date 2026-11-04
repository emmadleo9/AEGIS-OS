/** Inspect what pages exist in the debug chrome and which profile context they belong to. */
import { createRequire } from 'node:module';
const require2 = createRequire('c:/Users/User/.vscode/extensions/danielsanmedium.dscodegpt-3.24.81/standalone/');
const { chromium } = require2('patchright');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
console.log('contexts:', browser.contexts().length);
for (const [index, ctx] of browser.contexts().entries()) {
  console.log(`context ${index}: pages=${ctx.pages().length}`);
  for (const page of ctx.pages()) console.log('   ', page.url().slice(0, 80));
}
await browser.close();
process.exit(0);
