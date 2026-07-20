# Agent tools

Tools live in `src/lib/server/tools`. Each tool implements `AgentTool` with:

- a provider-neutral structured function definition;
- one `execute(arguments, context)` method;
- a result created through `createToolResult`, with compact model data and one
  typed `outputs` list for user-facing context.

`ToolOutput` is a discriminated union supporting `source`, `image`, `text`, and
structured `data` items. The agent annotates every item with its originating
tool call and stores one ordered output list on the assistant message. The UI
renders that list through one reusable component. Adding another output type
only requires extending the union and its renderer; there are no parallel
source/image metadata paths.

Agent activity is stored separately as one ordered trace of reusable
`{ title, output }` disclosure items. Tool entries include their inputs and
actual returned data; reasoning entries use the same presentation. The live
stream and saved message history render the same trace representation.

Shared validation helpers such as `readObject`, `clampText`, `clampInteger`,
`compactText`, and `toJsonValue` live in `src/lib/server/utils/values.ts`.

`ToolRegistry` owns registration, definition selection, argument parsing,
unknown-tool handling, and execution errors. Add a tool by creating an
`AgentTool`, registering it in `tools/index.ts`, and adding its name to the
appropriate chat mode's allow-list. No provider or agent-loop changes are
needed.

Built-in tools:

- `get_datetime` returns the current ISO time plus a formatted value in an
  optional IANA timezone.
- `search` queries the local document store using semantic, BM25, hybrid, or
  API-only comparison mode. Chat supplies the selected document IDs,
  retrieval-mode default, and result limit through execution context, so model
  arguments cannot broaden the selected document scope.
- `python` runs backend Python code in Pyodide's WebAssembly runtime, so the
  host does not need a native Python installation. NumPy and Matplotlib are
  loaded when the worker starts. Printed output and the final expression are
  returned to the model. Open Matplotlib figures are captured automatically as
  compact PNG images and returned through the same typed output list as source
  context; there is no chart-specific browser renderer or graph specification
  format.

The Pyodide worker is reused between calls, but each call receives fresh Python
globals. Calls are serialized and interrupted after ten seconds. The first use
downloads Pyodide's official NumPy and Matplotlib packages into the configured
cache; later calls reuse them.

The agent runner accepts normalized streamed call deltas and the object-form
arguments returned by some local servers. It preserves assistant content and
reasoning between calls, appends each result as a `tool` message, supports
multiple calls/turns, and disables tools after the configured tool-turn budget
to obtain a final answer. Tool selection remains with the model; the runner does
not force `search` or any other tool as generic uncertainty recovery.
