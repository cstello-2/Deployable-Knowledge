import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { ImageArtifact } from '$lib/types';
import type { AgentTool, ToolExecutionContext } from './types';
import { createToolResult, imageOutput } from './result';
import { clampText, readObject, toJsonValue } from '../utils/values';
import { DocumentsRepository } from '../repositories/documents.repository';
import {
	DOCUMENTS_DIR,
	PYTHON_DOCUMENTS_MOUNT,
	pythonDocumentPath
} from '../documents/python-path';

const MAX_CODE_CHARS = 24_000;
const MAX_TEXT_CHARS = 32_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// Pyodide runs WebAssembly-speed Python, so pandas-style data work needs more
// headroom than native Python would.
const EXECUTION_TIMEOUT_MS = 20_000;

const RETRY_HINT =
	'The code did not run to completion. Read the error, fix the code (or make it faster if it timed out), and call python again with the complete corrected script. Small errors are expected and fixable — do not give up after a failed attempt.';

const PYTHON_RUNNER = String.raw`
import ast
import base64
import contextlib
import io
import json
import linecache
import traceback

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

def _dk_json_default(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    return repr(value)

def _dk_format_error(exc):
    # Keep only the frames from the agent's own code plus the final error
    # line, so the model sees a short, fixable error instead of a full
    # traceback through the runner internals.
    frames = [
        frame
        for frame in traceback.extract_tb(exc.__traceback__)
        if frame.filename == "agent.py"
    ]
    lines = traceback.format_list(frames) if frames else []
    lines += traceback.format_exception_only(type(exc), exc)
    return "".join(lines).strip()

def _dk_execute(code):
    stdout = io.StringIO()
    stderr = io.StringIO()
    result = None
    error = ""
    images = []
    namespace = {"__name__": "__main__"}
    plt.close("all")
    # Seed linecache so tracebacks quote the offending source line.
    linecache.cache["agent.py"] = (len(code), None, code.splitlines(True), "agent.py")

    try:
        tree = ast.parse(code, filename="agent.py", mode="exec")
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                prefix = ast.Module(body=tree.body[:-1], type_ignores=[])
                if prefix.body:
                    exec(compile(prefix, "agent.py", "exec"), namespace)
                expression = ast.Expression(tree.body[-1].value)
                result = eval(compile(expression, "agent.py", "eval"), namespace)
            else:
                exec(compile(tree, "agent.py", "exec"), namespace)

        for figure_number in plt.get_fignums()[:${MAX_IMAGES}]:
            buffer = io.BytesIO()
            plt.figure(figure_number).savefig(
                buffer,
                format="png",
                dpi=90,
                bbox_inches="tight",
            )
            images.append(base64.b64encode(buffer.getvalue()).decode("ascii"))
    except BaseException as exc:
        error = _dk_format_error(exc)
    finally:
        plt.close("all")
        linecache.cache.pop("agent.py", None)

    return json.dumps(
        {
            "status": "error" if error else "ok",
            "stdout": stdout.getvalue(),
            "stderr": stderr.getvalue(),
            "result": result,
            "error": error,
            "images": images,
        },
        default=_dk_json_default,
        ensure_ascii=False,
    )

_dk_execute(__dk_code)
`;

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");

let visibleDocumentFiles = new Set();

// Emscripten has no read-only mounts, so this wraps NODEFS and rejects every
// write. The FS caches nodes it has already looked up, so getattr and open
// re-check visibility for files that have since left the chat's scope.
function mountDocuments(pyodide, hostRoot, mountPoint) {
  const { FS, ERRNO_CODES } = pyodide;
  const NODEFS = FS.filesystems.NODEFS;
  const fail = (code) => {
    throw new FS.ErrnoError(code);
  };
  const readOnly = () => fail(ERRNO_CODES.EROFS);
  const assertVisible = (node) => {
    if (node === node.mount.root) return;
    while (node.parent !== node.mount.root) node = node.parent;
    if (!visibleDocumentFiles.has(node.name)) fail(ERRNO_CODES.ENOENT);
  };
  const nodeOps = {
    ...NODEFS.node_ops,
    getattr(node) {
      assertVisible(node);
      return NODEFS.node_ops.getattr(node);
    },
    lookup(parent, name) {
      if (parent === parent.mount.root && !visibleDocumentFiles.has(name)) {
        fail(ERRNO_CODES.ENOENT);
      }
      return withReadOnlyOps(NODEFS.node_ops.lookup(parent, name));
    },
    readdir(node) {
      const names = NODEFS.node_ops.readdir(node);
      return node === node.mount.root
        ? names.filter((name) => visibleDocumentFiles.has(name))
        : names;
    },
    setattr: readOnly,
    mknod: readOnly,
    rename: readOnly,
    unlink: readOnly,
    rmdir: readOnly,
    symlink: readOnly,
  };
  const streamOps = {
    ...NODEFS.stream_ops,
    open(stream) {
      assertVisible(stream.node);
      // O_ACCMODE bits: anything other than O_RDONLY requests write access.
      if ((stream.flags & 3) !== 0) readOnly();
      NODEFS.stream_ops.open(stream);
    },
    setattr: readOnly,
    write: readOnly,
    msync: readOnly,
  };
  function withReadOnlyOps(node) {
    node.node_ops = nodeOps;
    node.stream_ops = streamOps;
    return node;
  }

  FS.mkdirTree(mountPoint);
  FS.mount(
    { mount: (mount) => withReadOnlyOps(NODEFS.mount(mount)) },
    { root: hostRoot },
    mountPoint
  );
}

async function start() {
  const { loadPyodide } = await import("pyodide");
  const pyodide = await loadPyodide({
    indexURL: workerData.indexURL,
    packages: ["numpy", "pandas", "matplotlib"],
    packageCacheDir: workerData.packageCacheDir,
    jsglobals: Object.create(null),
    stdout() {},
    stderr() {},
  });
  // Pre-warm the heavy imports during startup so their cost never counts
  // against a per-execution timeout.
  await pyodide.runPythonAsync(
    'import matplotlib\nmatplotlib.use("Agg")\nimport matplotlib.pyplot, numpy, pandas'
  );
  mountDocuments(pyodide, workerData.documentsRoot, workerData.documentsMount);
  const interruptBuffer = new Int32Array(workerData.interruptBuffer);
  pyodide.setInterruptBuffer(interruptBuffer);
  parentPort.postMessage({ type: "ready" });

  parentPort.on("message", async ({ id, code, documentFiles }) => {
    Atomics.store(interruptBuffer, 0, 0);
    let globals;

    try {
      visibleDocumentFiles = new Set(documentFiles);
      globals = pyodide.toPy({ __dk_code: code });
      const envelope = await pyodide.runPythonAsync(workerData.runner, {
        globals,
      });
      parentPort.postMessage({ type: "result", id, envelope });
    } catch (error) {
      parentPort.postMessage({
        type: "result",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      globals?.destroy();
    }
  });
}

start().catch((error) => {
  parentPort.postMessage({
    type: "fatal",
    error: error instanceof Error ? error.message : String(error),
  });
});
`;

type PythonEnvelope = {
	status?: unknown;
	stdout?: unknown;
	stderr?: unknown;
	result?: unknown;
	error?: unknown;
	images?: unknown;
};

type PythonToolData = {
	status: 'ok' | 'error';
	stdout: string;
	stderr: string;
	result: unknown;
	error?: string;
	hint?: string;
	images: Array<Pick<ImageArtifact, 'id' | 'mimeType' | 'alt'>>;
};

type ExecutionRequest = {
	code: string;
	// File names inside the documents directory that this call may read.
	documentFiles: string[];
};

type WorkerMessage =
	| { type: 'ready' }
	| { type: 'fatal'; error: string }
	| { type: 'result'; id: string; envelope?: string; error?: string };

type PendingExecution = {
	resolve: (value: string) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	forcedTermination?: ReturnType<typeof setTimeout>;
	timedOut: boolean;
};

type WorkerState = {
	worker: Worker;
	interruptBuffer: Int32Array;
	ready: Promise<void>;
	rejectReady: (error: Error) => void;
	pending: Map<string, PendingExecution>;
};

type PythonModuleState = {
	workerState?: WorkerState;
	executionQueue: Promise<unknown>;
};

const moduleState = ((
	globalThis as typeof globalThis & { deployableKnowledgePythonState?: PythonModuleState }
).deployableKnowledgePythonState ??= { executionQueue: Promise.resolve() });

export const pythonTool: AgentTool<PythonToolData> = {
	id: 'python',
	label: 'Python',
	description:
		'Runs Python with NumPy, pandas, and Matplotlib for calculations and charts, with read-only access to document files.',
	modes: ['document', 'notebook'],
	instructions: `PYTHON TOOL POLICY:
- Use the python tool for exact calculations, data transformations, statistics, or requested visualizations instead of doing substantial arithmetic manually. Python runs in the backend through Pyodide and includes NumPy, pandas, and Matplotlib.
- You can create visualizations with normal Pyodide/Matplotlib code. Any open Matplotlib figures are automatically sent to the user as images. A request for a chart, plot, graph, or data visualization is incomplete until you successfully create it with the python tool; do not substitute an ASCII chart or text-only table unless the user asks for one.
- For CSV data, call corpus_details to get documentPath, then use pandas.read_csv(documentPath). Use chunksize for large CSVs. Document files are read-only; CSV and plain text are supported, with no PDF or Excel parser installed.
- If a python call returns an error, do not apologize or give up: read the reported error, fix the code, and call python again with the complete corrected script. Small mistakes such as typos, missing imports, or wrong variable names are normal and easy to fix.`,
	definition: {
		description:
			'Run Python with NumPy, pandas, and Matplotlib for calculations, data analysis, and charts. Get CSV paths from corpus_details and read them with pandas.read_csv. Printed text, the final expression, and open Matplotlib figures are returned automatically. If a call fails, fix the code and retry.',
		parameters: {
			type: 'object',
			properties: {
				code: {
					type: 'string',
					description:
						'Complete Python code. Read CSVs using paths from corpus_details. The final expression and open Matplotlib figures are returned.'
				}
			},
			required: ['code'],
			additionalProperties: false
		}
	},
	async execute(argumentsValue, context) {
		const args = readObject(argumentsValue);
		const code = clampText(args.code, MAX_CODE_CHARS + 1);

		if (!code) {
			return pythonErrorResult('python requires non-empty code in the "code" argument.');
		}
		if (code.length > MAX_CODE_CHARS) {
			return pythonErrorResult(
				`python code exceeds ${MAX_CODE_CHARS} characters. Send a shorter script.`
			);
		}

		let envelope: PythonEnvelope;
		try {
			const documents = await documentFilesInScope(context);
			envelope = parseEnvelope(await enqueueExecution({ code, ...documents }));
		} catch (error) {
			envelope = {
				status: 'error',
				error: error instanceof Error ? error.message : String(error)
			};
		}

		const images = collectImages(envelope.images);
		const error = readText(envelope.error);
		const status = envelope.status === 'ok' && !error ? 'ok' : 'error';
		const data: PythonToolData = {
			status,
			stdout: readText(envelope.stdout),
			stderr: readText(envelope.stderr),
			result: toJsonValue(envelope.result),
			...(error ? { error } : {}),
			...(status === 'error' ? { hint: RETRY_HINT } : {}),
			images: images.map(({ id, mimeType, alt }) => ({ id, mimeType, alt }))
		};

		return createToolResult(data, {
			outputs: images.map(imageOutput),
			isError: data.status === 'error'
		});
	}
};

function pythonErrorResult(error: string) {
	return createToolResult<PythonToolData>(
		{ status: 'error', stdout: '', stderr: '', result: null, error, hint: RETRY_HINT, images: [] },
		{ isError: true }
	);
}

async function documentFilesInScope(
	context: ToolExecutionContext
): Promise<Omit<ExecutionRequest, 'code'>> {
	const documentIds =
		Array.isArray(context.documentIds) && context.documentIds.length > 0
			? context.documentIds
			: undefined;
	const documentFiles = (await DocumentsRepository.files({ documentIds })).flatMap((document) => {
		const path = pythonDocumentPath(document.sourcePath);
		return path ? [posix.basename(path)] : [];
	});

	return { documentFiles };
}

function enqueueExecution(request: ExecutionRequest): Promise<string> {
	const execution = moduleState.executionQueue.then(() => executeInWorker(request));
	moduleState.executionQueue = execution.then(
		() => undefined,
		() => undefined
	);
	return execution;
}

async function executeInWorker(request: ExecutionRequest): Promise<string> {
	const state = getWorkerState();
	await state.ready;
	const id = randomUUID();

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			const pending = state.pending.get(id);
			if (!pending) return;

			pending.timedOut = true;
			Atomics.store(state.interruptBuffer, 0, 2);
			pending.forcedTermination = setTimeout(() => {
				state.pending.delete(id);
				if (moduleState.workerState === state) moduleState.workerState = undefined;
				reject(new Error(`Python execution exceeded ${EXECUTION_TIMEOUT_MS / 1000} seconds`));
				void state.worker.terminate();
			}, 1_000);
		}, EXECUTION_TIMEOUT_MS);

		state.pending.set(id, {
			resolve,
			reject,
			timeout,
			timedOut: false
		});
		state.worker.postMessage({ id, ...request });
	});
}

function getWorkerState(): WorkerState {
	if (moduleState.workerState) return moduleState.workerState;

	const sharedBuffer = new SharedArrayBuffer(4);
	const interruptBuffer = new Int32Array(sharedBuffer);
	let resolveReady!: () => void;
	let rejectReady!: (error: Error) => void;
	const ready = new Promise<void>((resolve, reject) => {
		resolveReady = resolve;
		rejectReady = reject;
	});
	const packageCacheDir =
		process.env.PYODIDE_PACKAGE_CACHE_DIR?.trim() || join(tmpdir(), 'deployable-knowledge-pyodide');
	mkdirSync(packageCacheDir, { recursive: true });
	const documentsRoot = resolve(DOCUMENTS_DIR);
	mkdirSync(documentsRoot, { recursive: true });
	const indexURL = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
	const worker = new Worker(WORKER_SOURCE, {
		eval: true,
		execArgv: [],
		workerData: {
			interruptBuffer: sharedBuffer,
			indexURL,
			packageCacheDir,
			runner: PYTHON_RUNNER,
			documentsRoot,
			documentsMount: PYTHON_DOCUMENTS_MOUNT
		}
	});
	const state: WorkerState = {
		worker,
		interruptBuffer,
		ready,
		rejectReady,
		pending: new Map()
	};
	moduleState.workerState = state;

	worker.on('message', (message: WorkerMessage) => {
		if (message.type === 'ready') {
			resolveReady();
			return;
		}

		if (message.type === 'fatal') {
			failWorker(state, new Error(`Unable to initialize Pyodide: ${message.error}`));
			return;
		}

		const pending = state.pending.get(message.id);
		if (!pending) return;

		state.pending.delete(message.id);
		clearTimeout(pending.timeout);
		if (pending.forcedTermination) clearTimeout(pending.forcedTermination);

		if (pending.timedOut) {
			pending.reject(new Error(`Python execution exceeded ${EXECUTION_TIMEOUT_MS / 1000} seconds`));
		} else if (message.error) {
			pending.reject(new Error(message.error));
		} else {
			pending.resolve(message.envelope ?? '');
		}
	});
	worker.on('error', (error) =>
		failWorker(state, error instanceof Error ? error : new Error(String(error)))
	);
	worker.on('exit', (code) => {
		if (moduleState.workerState === state) {
			failWorker(state, new Error(`Pyodide worker exited with code ${code}`));
		}
	});

	return state;
}

function failWorker(state: WorkerState, error: Error) {
	if (moduleState.workerState === state) moduleState.workerState = undefined;
	state.rejectReady(error);

	for (const pending of state.pending.values()) {
		clearTimeout(pending.timeout);
		if (pending.forcedTermination) clearTimeout(pending.forcedTermination);
		pending.reject(error);
	}

	state.pending.clear();
}

function parseEnvelope(value: string): PythonEnvelope {
	try {
		return readObject(JSON.parse(value)) as PythonEnvelope;
	} catch {
		return {
			status: 'error',
			error: 'Pyodide returned invalid execution output'
		};
	}
}

export function collectImages(value: unknown): ImageArtifact[] {
	if (!Array.isArray(value)) return [];

	return value.slice(0, MAX_IMAGES).flatMap((candidate, index) => {
		if (typeof candidate !== 'string' || !isBase64(candidate)) return [];
		if (Buffer.byteLength(candidate, 'base64') > MAX_IMAGE_BYTES) return [];

		return [
			{
				id: randomUUID(),
				mimeType: 'image/png' as const,
				base64: candidate,
				alt: `Python output ${index + 1}`
			}
		];
	});
}

function isBase64(value: string): boolean {
	return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function readText(value: unknown): string {
	return clampText(value, MAX_TEXT_CHARS);
}
