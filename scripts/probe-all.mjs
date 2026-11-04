/** Probe every chrome debug port found on the machine and list each instance's tabs. */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require2 = createRequire('c:/Users/User/.vscode/extensions/danielsanmedium.dscodegpt-3.24.81/standalone/');
const { chromium } = require2('patchright');

const output = execSync("wmic process where \"name='chrome.exe'\" get CommandLine /format:list", { encoding: 'utf8' });
const ports = new Set();
for (const match of output.matchAll(/--remote-debugging-port=(\d+)/g)) ports.add(match[1]);
console.log('ports:', [...ports]);

for (const port of ports) {
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    console.log(`\n=== port ${port}: ${browser.contexts().length} context(s) ===`);
    for (const ctx of browser.contexts()) {
      for (const page of ctx.pages()) console.log('  ', page.url().slice(0, 100));
    }
    await browser.close();
  } catch (error) {
    console.log(`port ${port}: unreachable (${String(error).split('\n')[0].slice(0, 60)})`);
  }
}
