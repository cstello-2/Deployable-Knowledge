import { spawn, type ChildProcess } from 'node:child_process';
import { constants, createWriteStream } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import type { ServerMessage } from './server.ts';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER_ENTRY = join(APP_ROOT, 'electron', 'server.ts');
const PRELOAD_ENTRY = join(APP_ROOT, 'electron', 'preload.cjs');
const SERVER_START_TIMEOUT_MS = 120_000;

const SEEDED_RUNTIME_FILES = ['eng.traineddata'];
const RUNTIME_DIRECTORIES = [
	'documents',
	'models',
	join('.cache', 'embeddings'),
	join('.cache', 'transformersjs'),
	'logs'
];

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
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

async function start(): Promise<void> {
	installMenu();
	registerWindowControls();

	// Chromium blocks picking home, Documents, Desktop, and system folders. Chrome
	// explains that and reopens the picker, but Electron rejects it silently, which
	// the app cannot tell apart from a cancel.
	session.defaultSession.on('file-system-access-restricted', async (_event, details, callback) => {
		const { response } = await dialog.showMessageBox({
			type: 'warning',
			message: `“${details.path}” can't be opened`,
			detail: 'It is a protected location. Choose a folder inside it instead.',
			buttons: ['Choose another folder', 'Cancel'],
			defaultId: 0,
			cancelId: 1
		});
		callback(response === 0 ? 'tryAgain' : 'deny');
	});

	const url = app.isPackaged ? await startPackagedServer() : await startDevServer();

	createWindow(url);
}

async function prepareDataDirectory(dataDirectory: string): Promise<void> {
	for (const directory of RUNTIME_DIRECTORIES) {
		await mkdir(join(dataDirectory, directory), { recursive: true });
	}

	for (const fileName of SEEDED_RUNTIME_FILES) {
		await copyFile(
			join(APP_ROOT, fileName),
			join(dataDirectory, fileName),
			constants.COPYFILE_EXCL
		).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== 'EEXIST') throw error;
		});
	}
}

async function startPackagedServer(): Promise<string> {
	const dataDirectory = app.getPath('userData');
	await prepareDataDirectory(dataDirectory);

	const log = createWriteStream(join(dataDirectory, 'logs', 'server.log'), { flags: 'a' });
	const recentOutput: string[] = [];

	const child = spawn(process.execPath, [SERVER_ENTRY], {
		cwd: dataDirectory,
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: '1',
			DK_APP_ROOT: APP_ROOT,
			DK_MIGRATIONS_DIR: join(APP_ROOT, 'drizzle'),
			BODY_SIZE_LIMIT: 'Infinity',
			// ffmpeg-static locates its binary through `__dirname`, which packaging breaks.
			FFMPEG_PATH: join(
				APP_ROOT,
				'node_modules',
				'ffmpeg-static',
				process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
			)
		}
	});
	serverProcess = child;

	for (const stream of [child.stdout, child.stderr]) {
		stream?.setEncoding('utf8');
		stream?.on('data', (chunk: string) => {
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

		child.on('message', (message) => {
			const { type, port } = message as ServerMessage;
			if (type !== 'listening') return;
			clearTimeout(timer);
			listening = true;
			resolve(`http://127.0.0.1:${port}`);
		});

		child.on('exit', (code) => {
			clearTimeout(timer);
			if (quitting) return;
			const error = new Error(
				`The local server exited with code ${code}.\n\n${recentOutput.join('')}`
			);
			if (listening) reportFatal(error, 'The local server stopped');
			else reject(error);
		});

		child.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}

async function startDevServer(): Promise<string> {
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

function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.on('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as AddressInfo;
			probe.close(() => resolve(port));
		});
	});
}

async function waitForServer(url: string): Promise<void> {
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

function createWindow(url: string): void {
	const window = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 960,
		minHeight: 600,
		backgroundColor: '#101014',
		frame: false,
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: PRELOAD_ENTRY,
			sandbox: true,
			spellcheck: false
		}
	});
	mainWindow = window;

	window.once('ready-to-show', () => window.show());
	window.on('closed', () => (mainWindow = null));
	window.on('maximize', () => window.webContents.send('window:maximized-changed', true));
	window.on('unmaximize', () => window.webContents.send('window:maximized-changed', false));

	window.webContents.setWindowOpenHandler(({ url: target }) => {
		void shell.openExternal(target);
		return { action: 'deny' };
	});

	window.webContents.on('will-navigate', (event, target) => {
		if (new URL(target).origin === new URL(url).origin) return;
		event.preventDefault();
		void shell.openExternal(target);
	});

	void window.loadURL(url);
}

function registerWindowControls(): void {
	ipcMain.on('window:minimize', (event) => {
		BrowserWindow.fromWebContents(event.sender)?.minimize();
	});

	ipcMain.on('window:toggle-maximize', (event) => {
		const window = BrowserWindow.fromWebContents(event.sender);
		if (window?.isMaximized()) window.unmaximize();
		else window?.maximize();
	});

	ipcMain.on('window:close', (event) => {
		BrowserWindow.fromWebContents(event.sender)?.close();
	});

	ipcMain.handle(
		'window:is-maximized',
		(event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
	);
}

function installMenu(): void {
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

function reportFatal(error: unknown, title = 'Deployable Knowledge failed to start'): void {
	quitting = true;
	serverProcess?.kill();
	dialog.showErrorBox(
		title,
		error instanceof Error ? (error.stack ?? error.message) : String(error)
	);
	app.exit(1);
}
