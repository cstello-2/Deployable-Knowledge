import { spawn } from 'node:child_process';
import { constants, createWriteStream } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER_ENTRY = join(APP_ROOT, 'electron', 'server.mjs');
const SERVER_START_TIMEOUT_MS = 120_000;

// Runtime files the SvelteKit server resolves against its working directory.
// In a packaged app that directory is per-user and starts empty, so the shipped
// copies have to be seeded on first launch.
const SEEDED_RUNTIME_FILES = ['eng.traineddata'];
const RUNTIME_DIRECTORIES = ['documents', 'models', join('.cache', 'transformersjs'), 'logs'];

/** @type {import('node:child_process').ChildProcess | null} */
let serverProcess = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});

	app.whenReady().then(start).catch(reportFatal);
}

async function start() {
	installMenu();

	const url = app.isPackaged ? await startPackagedServer() : await startDevServer();

	createWindow(url);
}

async function prepareDataDirectory(dataDirectory) {
	for (const directory of RUNTIME_DIRECTORIES) {
		await mkdir(join(dataDirectory, directory), { recursive: true });
	}

	for (const fileName of SEEDED_RUNTIME_FILES) {
		// COPYFILE_EXCL keeps an existing user copy untouched.
		await copyFile(
			join(APP_ROOT, fileName),
			join(dataDirectory, fileName),
			constants.COPYFILE_EXCL
		).catch((error) => {
			if (error.code === 'EEXIST') return;
			throw error;
		});
	}
}

/**
 * Boots the adapter-node build in a child process so model inference, OCR, and
 * transcription never block the UI process. The child reports the port it bound.
 */
async function startPackagedServer() {
	const dataDirectory = app.getPath('userData');
	await prepareDataDirectory(dataDirectory);

	const log = createWriteStream(join(dataDirectory, 'logs', 'server.log'), { flags: 'a' });
	const recentOutput = [];

	serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
		cwd: dataDirectory,
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: '1',
			DK_APP_ROOT: APP_ROOT,
			DK_MIGRATIONS_DIR: join(APP_ROOT, 'drizzle'),
			BODY_SIZE_LIMIT: 'Infinity',
			FFMPEG_PATH: ffmpegPath()
		}
	});

	for (const stream of [serverProcess.stdout, serverProcess.stderr]) {
		stream.setEncoding('utf8');
		stream.on('data', (chunk) => {
			recentOutput.push(chunk);
			if (recentOutput.length > 100) recentOutput.shift();
			log.write(chunk);
			process.stdout.write(chunk);
		});
	}

	let listening = false;

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`The local server did not start within ${SERVER_START_TIMEOUT_MS}ms.`));
		}, SERVER_START_TIMEOUT_MS);

		serverProcess.on('message', (message) => {
			if (message?.type !== 'listening') return;
			clearTimeout(timer);
			listening = true;
			resolve(`http://127.0.0.1:${message.port}`);
		});

		serverProcess.on('exit', (code) => {
			clearTimeout(timer);
			if (quitting) return;
			const error = new Error(
				`The local server exited with code ${code}.\n\n${recentOutput.join('')}`
			);
			// A crash after startup leaves the window pointed at a dead port, so
			// surface it instead of letting the app sit there half alive.
			if (listening) reportFatal(error, 'The local server stopped');
			else reject(error);
		});

		serverProcess.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}

function ffmpegPath() {
	// `audio-decoder.ts` prefers `FFMPEG_PATH` over ffmpeg-static's own lookup, so
	// point it at the copy that shipped with the app instead of relying on that
	// package's `__dirname` resolution surviving packaging.
	const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
	return join(APP_ROOT, 'node_modules', 'ffmpeg-static', binary);
}

/**
 * Development runs the real Vite dev server so HMR keeps working inside the
 * Electron window. `DK_DEV_SERVER_URL` attaches to an already running one.
 */
async function startDevServer() {
	const existing = process.env.DK_DEV_SERVER_URL?.trim();
	if (existing) {
		await waitForServer(existing);
		return existing;
	}

	const port = await findFreePort();
	const url = `http://localhost:${port}`;

	serverProcess = spawn(
		process.platform === 'win32' ? 'npm.cmd' : 'npm',
		['run', 'dev', '--', '--port', String(port), '--strictPort'],
		{ cwd: APP_ROOT, stdio: 'inherit', shell: process.platform === 'win32' }
	);

	serverProcess.on('error', (error) => reportFatal(error, 'The dev server could not be started'));

	await waitForServer(url);
	return url;
}

function findFreePort() {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.on('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address();
			probe.close(() => resolve(port));
		});
	});
}

async function waitForServer(url) {
	const deadline = Date.now() + SERVER_START_TIMEOUT_MS;

	while (Date.now() < deadline) {
		try {
			await fetch(url, { method: 'HEAD' });
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}

	throw new Error(`The dev server at ${url} did not respond within ${SERVER_START_TIMEOUT_MS}ms.`);
}

function createWindow(url) {
	mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 960,
		minHeight: 600,
		backgroundColor: '#101014',
		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			spellcheck: false
		}
	});

	mainWindow.once('ready-to-show', () => mainWindow?.show());
	mainWindow.on('closed', () => (mainWindow = null));

	// Keep every off-app destination in the user's browser; the window itself is
	// the workspace and must not become a general purpose browser.
	mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
		void shell.openExternal(target);
		return { action: 'deny' };
	});

	mainWindow.webContents.on('will-navigate', (event, target) => {
		if (new URL(target).origin === new URL(url).origin) return;
		event.preventDefault();
		void shell.openExternal(target);
	});

	void mainWindow.loadURL(url);
}

function installMenu() {
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			{ role: 'fileMenu' },
			{ role: 'editMenu' },
			{ role: 'viewMenu' },
			{ role: 'windowMenu' }
		])
	);
}

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
	quitting = true;
	serverProcess?.kill();
});

function reportFatal(error, title = 'Deployable Knowledge failed to start') {
	quitting = true;
	serverProcess?.kill();
	dialog.showErrorBox(title, String(error?.stack ?? error));
	app.exit(1);
}
