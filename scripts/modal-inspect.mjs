/** Dump the NVIDIA sign-in modal contents so we can drive the right fields. */
import { createRequire } from 'node:module';
const require2 = createRequire('c:/Users/User/.vscode/extensions/danielsanmedium.dscodegpt-3.24.81/standalone/');
const { chromium } = require2('patchright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes('build.nvidia.com')) ?? context.pages()[0];
console.log('at:', page.url());

const info = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')].map((i) => ({ type: i.type, name: i.name, id: i.id, placeholder: i.placeholder, visible: i.offsetParent !== null }));
  const buttons = [...document.querySelectorAll('button')].map((b) => ({ text: b.innerText?.slice(0, 40), visible: b.offsetParent !== null })).filter((b) => b.visible);
  const iframeUrls = [...document.querySelectorAll('iframe')].map((f) => f.src?.slice(0, 80));
  return { inputs: inputs.filter((i) => i.visible), buttons: buttons.slice(0, 20), iframeUrls };
}).catch((e) => ({ error: String(e).slice(0, 100) }));
console.log(JSON.stringify(info, null, 1));
await browser.close();
process.exit(0);
