import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Worker } from "node:worker_threads";

import type { ImageArtifact } from "$lib/imageTypes";
import type { AgentTool } from "./types";
import { createToolResult, imageOutput } from "./result";
import { clampText, readObject, toJsonValue } from "../utils/values";

const MAX_CODE_CHARS = 24_000;
const MAX_TEXT_CHARS = 32_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const EXECUTION_TIMEOUT_MS = 10_000;

const PYTHON_RUNNER = String.raw`
import ast
import base64
import contextlib
import io
import json
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

def _dk_execute(code):
    stdout = io.StringIO()
    stderr = io.StringIO()
    result = None
    error = ""
    images = []
    namespace = {"__name__": "__main__"}
    plt.close("all")

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
    except BaseException:
        error = traceback.format_exc()
    finally:
        plt.close("all")

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

async function start() {
  const { loadPyodide } = await import("pyodide");
  const pyodide = await loadPyodide({
    indexURL: workerData.indexURL,
    packages: ["numpy", "matplotlib"],
    packageCacheDir: workerData.packageCacheDir,
    jsglobals: Object.create(null),
    stdout() {},
    stderr() {},
  });
  const interruptBuffer = new Int32Array(workerData.interruptBuffer);
  pyodide.setInterruptBuffer(interruptBuffer);
  parentPort.postMessage({ type: "ready" });

  parentPort.on("message", async ({ id, code }) => {
    Atomics.store(interruptBuffer, 0, 0);
    let globals;

    try {
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
  status: "ok" | "error";
  stdout: string;
  stderr: string;
  result: unknown;
  error?: string;
  images: Array<Pick<ImageArtifact, "id" | "mimeType" | "alt">>;
};

type WorkerMessage =
  | { type: "ready" }
  | { type: "fatal"; error: string }
  | { type: "result"; id: string; envelope?: string; error?: string };

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

let workerState: WorkerState | undefined;
let executionQueue = Promise.resolve();

export const pythonTool: AgentTool<PythonToolData> = {
  definition: {
    type: "function",
    function: {
      name: "python",
      description:
        "Run Python in the backend Pyodide WebAssembly runtime for exact calculations, data analysis, NumPy operations, and visualizations. NumPy and Matplotlib are installed. Printed text and the final expression are returned. Any open Matplotlib figures are automatically returned to the user as PNG images, so use normal Matplotlib APIs and do not encode images yourself.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "Complete Python code. NumPy is available as numpy and Matplotlib as matplotlib. The value of the final expression is returned, and every open Matplotlib figure is sent as an image.",
          },
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
  },
  async execute(argumentsValue) {
    const args = readObject(argumentsValue);
    const code = clampText(args.code, MAX_CODE_CHARS + 1);

    if (!code) throw new Error("python requires non-empty code");
    if (code.length > MAX_CODE_CHARS) {
      throw new Error(`python code exceeds ${MAX_CODE_CHARS} characters`);
    }

    const envelope = parseEnvelope(await enqueueExecution(code));
    const images = collectImages(envelope.images);
    const error = readText(envelope.error);
    const data: PythonToolData = {
      status: envelope.status === "ok" && !error ? "ok" : "error",
      stdout: readText(envelope.stdout),
      stderr: readText(envelope.stderr),
      result: toJsonValue(envelope.result),
      ...(error ? { error } : {}),
      images: images.map(({ id, mimeType, alt }) => ({ id, mimeType, alt })),
    };

    return createToolResult(data, {
      outputs: images.map(imageOutput),
      isError: data.status === "error",
    });
  },
};

function enqueueExecution(code: string): Promise<string> {
  const execution = executionQueue.then(() => executeInWorker(code));
  executionQueue = execution.then(
    () => undefined,
    () => undefined,
  );
  return execution;
}

async function executeInWorker(code: string): Promise<string> {
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
        if (workerState === state) workerState = undefined;
        reject(
          new Error(
            `Python execution exceeded ${EXECUTION_TIMEOUT_MS / 1000} seconds`,
          ),
        );
        void state.worker.terminate();
      }, 1_000);
    }, EXECUTION_TIMEOUT_MS);

    state.pending.set(id, {
      resolve,
      reject,
      timeout,
      timedOut: false,
    });
    state.worker.postMessage({ id, code });
  });
}

function getWorkerState(): WorkerState {
  if (workerState) return workerState;

  const sharedBuffer = new SharedArrayBuffer(4);
  const interruptBuffer = new Int32Array(sharedBuffer);
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const packageCacheDir =
    process.env.PYODIDE_PACKAGE_CACHE_DIR?.trim() ||
    join(tmpdir(), "deployable-knowledge-pyodide");
  mkdirSync(packageCacheDir, { recursive: true });
  const indexURL = dirname(
    createRequire(import.meta.url).resolve("pyodide/package.json"),
  );
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    execArgv: [],
    workerData: {
      interruptBuffer: sharedBuffer,
      indexURL,
      packageCacheDir,
      runner: PYTHON_RUNNER,
    },
  });
  const state: WorkerState = {
    worker,
    interruptBuffer,
    ready,
    rejectReady,
    pending: new Map(),
  };
  workerState = state;

  worker.on("message", (message: WorkerMessage) => {
    if (message.type === "ready") {
      resolveReady();
      return;
    }

    if (message.type === "fatal") {
      failWorker(state, new Error(`Unable to initialize Pyodide: ${message.error}`));
      return;
    }

    const pending = state.pending.get(message.id);
    if (!pending) return;

    state.pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (pending.forcedTermination) clearTimeout(pending.forcedTermination);

    if (pending.timedOut) {
      pending.reject(
        new Error(
          `Python execution exceeded ${EXECUTION_TIMEOUT_MS / 1000} seconds`,
        ),
      );
    } else if (message.error) {
      pending.reject(new Error(message.error));
    } else {
      pending.resolve(message.envelope ?? "");
    }
  });
  worker.on("error", (error) =>
    failWorker(state, error instanceof Error ? error : new Error(String(error))),
  );
  worker.on("exit", (code) => {
    if (workerState === state) {
      failWorker(state, new Error(`Pyodide worker exited with code ${code}`));
    }
  });

  return state;
}

function failWorker(state: WorkerState, error: Error) {
  if (workerState === state) workerState = undefined;
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
      status: "error",
      error: "Pyodide returned invalid execution output",
    };
  }
}

export function collectImages(value: unknown): ImageArtifact[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_IMAGES).flatMap((candidate, index) => {
    if (typeof candidate !== "string" || !isBase64(candidate)) return [];
    if (Buffer.byteLength(candidate, "base64") > MAX_IMAGE_BYTES) return [];

    return [
      {
        id: randomUUID(),
        mimeType: "image/png" as const,
        base64: candidate,
        alt: `Python output ${index + 1}`,
      },
    ];
  });
}

function isBase64(value: string): boolean {
  return (
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

function readText(value: unknown): string {
  return clampText(value, MAX_TEXT_CHARS);
}
