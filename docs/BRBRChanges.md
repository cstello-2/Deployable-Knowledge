# BRBR Changes Log (vA0.2.2)

This file summarizes implemented changes against the original four request groups.

## 1) Core GUI Fixes & Usability Polish

### 1.1 Correct RAG Context Order
- Retrieval/context ordering keeps strongest matches first; Chroma distances are converted to a **higher-is-better similarity** value for display and API `score` fields (labeled **Similarity** in the Search Context UI).
- The context payload includes snippet text so the pane is readable for analysis.

### 1.2 Document Count Refresh
- Upload selection/count now resets cleanly after successful upload and ingestion kickoff.
- Upload list UI is cleared after upload, avoiding stale "selected files" state.

### 1.3 Improve Document Filter Search
- Document library filtering now uses a stronger fuzzy approach (title + tags), with relevance scoring and ranked display.
- Added filter metadata (shown vs total) for quick user feedback.

## 2) Corpus Tagging & Filtering System

### 2.1 Official approved tag list
- Added corpus tag registry support and API endpoints for approved tags.
- Approved tags are persisted and surfaced in the document library UI.

### 2.2 Tag attribution per document
- Added per-document tag editing ("Tags..."), constrained to approved tags.
- Supports multiple tags per document.

### 2.3 Filter by official tags
- Added top-level document toolbar with selectable tag chips.
- Tag filters can be combined with text filtering and status filters.

### 2.4 Activated/Deactivated filters
- Added explicit list mode filters: All / Active in RAG / Inactive in RAG.

## 3) Document Activation & Status Management

### 3.1 Activate/deactivate by selected tags
- Added "Activate by selected tags" action: sets **active** for every document that has **all** of the toolbar-selected tags; documents that do not match are **left unchanged** (additive activation). Deactivation is only via per-document toggle, bulk deactivate on the current selection, or **Deactivate all**—tag activation no longer bulk-deactivates non-matching sources.
- Confirm copy and control tooltip describe this behavior.
- Added per-document activate/deactivate controls.

### 3.2 Deactivate all
- Added "Deactivate all" action for immediate context clearing.

### 3.3 Multi-select in documents pane
- Added multi-select with checkboxes and selection state.

### 3.4 Bulk actions
- Added bulk actions for selected documents:
  - add tag
  - remove tag
  - activate
  - deactivate
- Added contextual right-click menu for the same bulk actions.

## 4) Corpus Removal & Safety Features

### 4.1 Remove all documents
- Added "Remove all documents..." operation to clear vector corpus and related local document artifacts.

### 4.2 Confirmation prompts
- Added multi-step confirmation prompts before destructive remove-all action.

---

## Additional local-only and UX refinements (post-initial asks)

- Removed CAC/PIV/splash gate flow for local-only operation.
- Auto-ensured local user session on root load.
- Localized settings to Ollama-only in UI (no OpenAI option in settings UI).
- Added Ollama model listing endpoint for model dropdown population.
- Moved search action to Tools and labeled as "Search Context".
- Improved chat/session UX:
  - explicit New Chat control in chat input bar
  - session rename/delete APIs and per-session row actions
  - chat/session refresh/event handling stability improvements
- Version designation updated to `vA0.2.2` in UI and docs.

### Citations & passage navigation
- Assistant replies show a compact **Sources** strip (up to three top retrievals) using the same card pattern as Search Context, scaled down.
- **Open in document** opens `/static/doc_at.html?segment=<id>` in a new tab: loads segment metadata from `/segments/{id}`, then **PDFs** render the cited **page** with PDF.js and show the passage excerpt above the page; **text-like files** (txt, md, html, etc.) load the file and **scroll/highlight** the passage using `start_char`/`end_char` when present, otherwise a best-effort substring match. Unsupported extensions fall back to a raw file link. `/search` includes **`segment_id`**; chat **`sources`** use **`id`** as the same segment key.

### Header chrome
- Removed decorative rune string from the top-right header; right cluster is user menu only.
- **Menu** and **Tools** dropdowns are mutually exclusive (opening one closes the other); **User** menu is independent.

### Resilience & ops (embedding bootstrap)
- Launcher checks Python bootstrap **exit codes** and can retry Hugging Face download with `HF_HUB_DISABLE_SSL_VERIFICATION=1` when the first attempt fails (common on TLS-inspected networks).
- `get_documents()` tolerates missing model/DB so the home page can render empty-state instead of 500 when embeddings are unavailable.
- Embedding fetch wraps SSL failures with a clearer `RuntimeError` message (CA bundle / offline model copy guidance).

### Maintenance / cleanup
- Removed unused legacy **`app/static/js/ui/api.js`** (superseded by `sdk.js`), unused **`core/llm/openai_llm.py`** (runtime always uses Ollama via `make_llm`), and the unused **`windowTypes`** export from `windows.js`.
- **`renderer._load_template`** now reads JSON prompt files through **`prompts.loader`** instead of duplicating file I/O; ingest PDF parse failures use **`logging`** instead of `print`.

