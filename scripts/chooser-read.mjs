/** Read the sign-in chooser account list so we can pick emmadsafdar79 programmatically. */
import { createRequire } from 'node:module';
const require2 = createRequire('c:/Users/User/.vscode/extensions/danielsanmedium.dscodegpt-3.24.81/standalone/');
const { chromium } = require2('patchright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes('accounts.google')) ?? context.pages()[0];
console.log('at:', page.url().slice(0, 80));

const accounts = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('[data-identifier], [data-email], div[role=link][data-identifier]').forEach((el) => {
    out.push(el.getAttribute('data-identifier') || el.getAttribute('data-email') || el.innerText?.slice(0, 60));
  });
  const text = document.body?.innerText || '';
  return { list: out.filter(Boolean), text: text.slice(0, 800) };
}).catch((e) => ({ list: [], text: String(e).slice(0, 100) }));
console.log('chooser entries:', accounts.list);
console.log('--- chooser text ---');
console.log(accounts.text);
await browser.close();
process.exit(0);
