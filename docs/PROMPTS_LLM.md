# Prompt and LLM Integration

Prompt templates reside in the `prompts/` directory and can be listed or updated through the settings API. Templates define a system prompt, user formatting and how retrieved context is embedded into the prompt.

`core/prompts/renderer.py` resolves the active template, renders context and history, then calls the selected LLM provider via `core/llm` factories. Providers are chosen based on user settings (`ollama` by default).

The current TypeScript chat pipeline sends structured `system`, `user`,
`assistant`, and `tool` messages to providers. Tool definitions use the
provider-neutral structured function schema supported by the configured
providers.
The system prompt tells the model to assess tool results, refine calls when
needed, and produce a final answer once it has enough information. Assistant
content and provider reasoning fields are retained inside the loop between
tool calls. The UI receives model-turn and tool-call lifecycle events during
the run, and provider-supplied reasoning appears in the same title/output trace
as tool results; only final-answer text is
streamed as message content.

Document prompts do not contain eagerly retrieved RAG context. Instead they
instruct the model to use the `search` tool for document-specific questions and
to ground those claims in the returned chunks. Search is not used as a generic
uncertainty or tool-failure recovery mechanism. Notebook reference material
continues to be supplied directly; notebook chat exposes `get_datetime` and
`python`, while document chat also exposes `search`. The agent prompt explains
that Pyodide provides NumPy and Matplotlib and that Matplotlib figures are sent
to the user as images.

Return to [docs](README.md).