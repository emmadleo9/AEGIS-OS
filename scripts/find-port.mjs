/** Auto-detect the debug port: probe common ports AND inspect running chrome.exe command lines. */
import { execSync } from 'node:child_process';

// Read chrome command lines via WMI — the debug port is on whatever instance we started
const output = execSync('wmic process where "name=\'chrome.exe\'" get CommandLine /format:list', { encoding: 'utf8' });
const ports = new Set();
for (const match of output.matchAll(/--remote-debugging-port=(\d+)/g)) ports.add(match[1]);
console.log('debug ports found on live chrome:', [...ports]);
if (!ports.size) {
  console.log('no chrome instance has --remote-debugging-port. Close Chrome fully, then I restart it with the flag.');
}
