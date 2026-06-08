import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const isWindows = process.platform === 'win32';
const mode = process.argv[2] ?? 'all';
const backendHost = process.env.BACKEND_HOST ?? '127.0.0.1';
const backendPort = process.env.BACKEND_PORT ?? '8000';
const backendModule = process.env.BACKEND_MODULE ?? 'app.main:app';
const viteBin = join(root, 'node_modules', '.bin', isWindows ? 'vite.cmd' : 'vite');
const venvPython = join(root, 'venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
const pythonBin = existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3';
const children = new Set();

let shuttingDown = false;
let shutdownCode = 0;

function prefixOutput(child, name, streamName) {
  const output = streamName === 'stderr' ? process.stderr : process.stdout;
  let pending = '';

  child[streamName].on('data', (chunk) => {
    const lines = (pending + chunk.toString()).split(/\r?\n/);
    pending = lines.pop() ?? '';

    for (const line of lines) {
      if (line.length > 0) output.write(`[${name}] ${line}\n`);
    }
  });

  child[streamName].on('end', () => {
    if (pending.length > 0) output.write(`[${name}] ${pending}\n`);
  });
}

function runProcess(name, command, args = [], options = {}) {
  const isWindows = process.platform === "win32";

  const child = spawn(command, args, {
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    stdio: "inherit",
    shell: isWindows,
  });

  child.on("error", (err) => {
    console.error(`[${name}] failed to start:`, err);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited with signal ${signal}`);
    } else if (code !== 0) {
      console.log(`[${name}] exited with code ${code}`);
    }
  });

  return child;
}

function runFrontend() {
  runProcess('sveltekit', viteBin, ['dev']);
}

function runBackend() {
  const pythonPath = process.env.PYTHONPATH ? `${root}${delimiter}${process.env.PYTHONPATH}` : root;

  runProcess(
    'backend',
    pythonBin,
    [
      '-m',
      'uvicorn',
      backendModule,
      '--host',
      backendHost,
      '--port',
      backendPort,
      '--reload'
    ],
    {
      CHROMA_TELEMETRY_ENABLED: process.env.CHROMA_TELEMETRY_ENABLED ?? 'false',
      PYTHONPATH: pythonPath
    }
  );
}

function shutdown(code = 0) {
  if (shuttingDown) return;

  shuttingDown = true;
  shutdownCode = code;

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }

  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }, 5000).unref();

  if (children.size === 0) process.exit(shutdownCode);
}

switch (mode) {
  case 'all':
    runBackend();
    runFrontend();
    break;
  case 'backend':
    runBackend();
    break;
  default:
    console.error(`Unknown dev mode: ${mode}`);
    process.exit(1);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
