import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gatewayDir = path.join(root, 'gateway');
const consoleDir = path.join(root, 'console');
const runtimeDir = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'AEGIS-OS', 'runtime')
  : path.join(os.homedir(), '.aegis-os', 'runtime');
const gatewayRequire = createRequire(path.join(gatewayDir, 'package.json'));
const openwaMain = path.join(gatewayDir, 'dist', 'main.js');
const dotenv = gatewayRequire('dotenv');
for (const envFile of [
  path.join(consoleDir, '.env.local'),
  path.join(root, '.env.local'),
  path.join(root, '.env'),
  path.join(gatewayDir, '.env.local'),
  path.join(gatewayDir, '.env'),
]) {
  if (!fs.existsSync(envFile)) continue;
  const result = dotenv.config({ path: envFile });
  if (result.error) throw result.error;
}

const gatewayPort = Number(process.env.GATEWAY_PORT || process.env.AEGIS_PORT || 2785);
const consolePort = Number(process.env.CONSOLE_PORT || 5173);
const gatewayHealthUrl = `http://127.0.0.1:${gatewayPort}/api/health`;
const consoleHealthUrl = `http://127.0.0.1:${consolePort}/api/health`;
const children = new Set();
let stopping = false;
const providerSecretEnvKeys = [
  'NV_API_KEY',
  'NVIDIA_API_KEY',
  'NVIDIA_NIM_API_KEY',
  'VITE_NVIDIA_API_KEY',
  'VITE_NVIDIA_NIM_API_KEY',
  'GROQ_API_KEY',
  'VITE_GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_KEY',
  'VITE_OPENROUTER_API_KEY',
  'TAVILY_API_KEY',
  'VITE_TAVILY_API_KEY',
];

fs.mkdirSync(runtimeDir, { recursive: true });
const coordinatorPidFile = path.join(runtimeDir, 'singularity.pid');
fs.writeFileSync(coordinatorPidFile, String(process.pid), 'utf8');
process.once('exit', () => removePidFile(coordinatorPidFile, process.pid));

function assertPort(port, name) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a valid TCP port; received ${port}.`);
  }
}

async function getHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === 'online' && data.service === 'aegis-local-gateway';
  } catch {
    return false;
  }
}

async function waitForHealth(url, label, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await getHealth(url)) return;
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`${label} exited with code ${child.exitCode} before becoming ready.`);
    }
    if (child?.signalCode) {
      throw new Error(`${label} exited from signal ${child.signalCode} before becoming ready.`);
    }
    await delay(250);
  }
  throw new Error(`${label} did not become healthy at ${url} within 20 seconds.`);
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

function removePidFile(pidFile, pid) {
  if (!pidFile || !pid) return;
  try {
    if (Number(fs.readFileSync(pidFile, 'utf8')) === pid) fs.unlinkSync(pidFile);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`[AGUS] Could not clear ${pidFile}: ${error.message}`);
  }
}

function startChild(label, executable, args, cwd, env = process.env) {
  const child = spawn(executable, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.add(child);
  let pidFile;
  if (child.pid) {
    try {
      fs.mkdirSync(runtimeDir, { recursive: true });
      pidFile = path.join(runtimeDir, `${label.toLowerCase()}.pid`);
      fs.writeFileSync(pidFile, String(child.pid), 'utf8');
    } catch (error) {
      child.kill();
      throw new Error(`Could not record the ${label} process for STOP-AEGIS: ${error.message}`);
    }
  }
  child.once('error', (error) => {
    removePidFile(pidFile, child.pid);
    console.error(`[AGUS] Could not start ${label}: ${error.message}`);
    process.exitCode = 1;
    stopChildren();
  });
  child.once('exit', (code, signal) => {
    removePidFile(pidFile, child.pid);
    children.delete(child);
    if (stopping) return;
    console.error(`[AGUS] ${label} exited${signal ? ` from signal ${signal}` : ` with code ${code}`}.`);
    process.exitCode = code ?? 1;
    stopChildren();
  });
  return child;
}

async function main() {
  assertPort(gatewayPort, 'GATEWAY_PORT');
  assertPort(consolePort, 'CONSOLE_PORT');
  if (gatewayPort === consolePort) throw new Error('GATEWAY_PORT and CONSOLE_PORT must be different.');

  let gateway;
  if (!(await getHealth(gatewayHealthUrl))) {
    gateway = startChild(
      'Gateway',
      process.execPath,
      [path.join(gatewayDir, 'index.js')],
      gatewayDir,
      { ...process.env, GATEWAY_PORT: String(gatewayPort), AEGIS_PORT: String(gatewayPort) },
    );
    await waitForHealth(gatewayHealthUrl, 'Gateway', gateway);
  }

  if (!(await getHealth(consoleHealthUrl))) {
    const viteEntry = path.join(consoleDir, 'node_modules', 'vite', 'bin', 'vite.js');
    const consoleEnv = {
      ...process.env,
      GATEWAY_PORT: String(gatewayPort),
      AEGIS_PORT: String(gatewayPort),
      CONSOLE_PORT: String(consolePort),
      NODE_ENV: 'development',
    };
    for (const key of providerSecretEnvKeys) delete consoleEnv[key];
    const consoleServer = startChild(
      'Console',
      process.execPath,
      [viteEntry, '--host', '0.0.0.0', '--port', String(consolePort), '--strictPort'],
      consoleDir,
      consoleEnv,
    );
    await waitForHealth(consoleHealthUrl, 'Console proxy', consoleServer);
  }

  console.log(`[AGUS] Singularity running on http://localhost:${consolePort} (Gateway proxied via /api).`);

  process.once('SIGINT', () => {
    process.exitCode = 130;
    stopChildren();
  });
  process.once('SIGTERM', stopChildren);
}

main().catch((error) => {
  console.error(`[AGUS] Startup failed: ${error instanceof Error ? error.message : String