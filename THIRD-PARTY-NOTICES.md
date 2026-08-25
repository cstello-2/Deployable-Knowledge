# Third-Party Notices

Deployable Knowledge is distributed under the [MIT License](LICENSE). The application bundles and
downloads third-party components that are licensed separately. This file records those components
and the terms that govern them.

Nothing in this file changes the license of Deployable Knowledge's own source code. Where a bundled
component carries copyleft terms, those terms govern **that component only**.

---

## 1. FFmpeg — GNU General Public License v3.0 or later

**Component:** `ffmpeg-static@5.3.0`, which installs a prebuilt FFmpeg executable at
`node_modules/ffmpeg-static/ffmpeg` (`ffmpeg.exe` on Windows).
**Build:** `ffmpeg-7.0.2-amd64-static`, produced by John Van Sickle
(<https://johnvansickle.com/ffmpeg/>).
**License:** GPL-3.0-or-later. The build's own `ffmpeg.README` states: _"This static build is
licensed under the GNU General Public License version 3."_ It is compiled with GPL-licensed
components including `libx264`, `libx265`, `libxvid`, and `libvo-amrwbenc`.

The full GPLv3 text ships with the application at `node_modules/ffmpeg-static/ffmpeg.LICENSE`, and
is also available at <https://www.gnu.org/licenses/gpl-3.0.html>.

### Relationship to Deployable Knowledge

Deployable Knowledge does not link against FFmpeg. It executes the binary as a separate process over
FFmpeg's documented command-line interface (`src/lib/server/transcription/audio-decoder.ts` uses
`child_process.spawn`) solely to decode audio files to raw PCM for transcription. FFmpeg and
Deployable Knowledge are separate and independent works distributed together; the GPL governs the
FFmpeg executable, and the MIT License governs Deployable Knowledge.

### Written offer for corresponding source

In accordance with GPLv3 §6, the complete corresponding source code for the bundled FFmpeg binary is
available from:

- FFmpeg upstream source: <https://ffmpeg.org/download.html> (release 7.0.2)
- The packaging project that produced this binary: <https://github.com/eugeneware/ffmpeg-static>
- The build itself and its configuration: <https://johnvansickle.com/ffmpeg/>

For a period of three years from the date you received this software, the maintainers will also
provide, on request, a complete machine-readable copy of the corresponding source for the FFmpeg
build distributed with this application, for no more than the cost of physically performing the
distribution. Requests may be filed as an issue on the project repository:
<https://github.com/cstello-2/Deployable-Knowledge>.

### Patent notice

The bundled build includes `libx264` and `libx265`, which implement the H.264 and H.265 standards.
Copyright licensing and patent licensing are separate matters; the GPL grants no patent license for
those codecs from their respective patent holders.

---

## 2. libvips — GNU Lesser General Public License v3.0 or later

**Component:** `@img/sharp-libvips-<platform>@1.3.2`, the prebuilt libvips image-processing library
used by `sharp@0.35.3` for page-image rasterization (`src/lib/server/rag/chunk/page-images.ts`).
**License:** LGPL-3.0-or-later. Upstream: <https://github.com/libvips/libvips>.

`sharp` itself and the `@img/sharp-<platform>` native addon are Apache-2.0. Only the libvips payload
is LGPL.

libvips is loaded dynamically as a shared library by the `sharp` native addon, and is shipped
unmodified. Under LGPLv3 §4, recipients may modify libvips and relink the application against a
modified version: replace the shared library inside
`node_modules/@img/sharp-libvips-<platform>/lib/` in the installed application with your own build
of the same soname. The LGPLv3 text is available at <https://www.gnu.org/licenses/lgpl-3.0.html>,
and libvips source is available from the upstream repository above.

Windows releases carry `@img/sharp-libvips-win32-x64` under the same terms.

---

## 3. LibreOffice (WebAssembly) — Mozilla Public License 2.0

**Component:** `@matbee/libreoffice-converter@2.7.2` (~243 MB), used to convert `.docx` and `.pptx`
documents to PDF during ingestion.
**License:** MPL-2.0. Upstream: <https://github.com/matbee-eth/libreoffice-converter>; LibreOffice
itself: <https://www.libreoffice.org/about-us/source-code/>.

MPL-2.0 is file-level copyleft. The covered files are shipped unmodified; their source is available
from the upstream projects above. The MPL-2.0 text is available at
<https://mozilla.org/MPL/2.0/>.

---

## 4. Pyodide — Mozilla Public License 2.0

**Component:** `pyodide@314.0.2`, the WebAssembly Python runtime backing the assistant's Python tool
(`src/lib/server/tools/python.ts`).
**License:** MPL-2.0. Upstream: <https://github.com/pyodide/pyodide>.

Pyodide embeds CPython, distributed under the Python Software Foundation License 2.0, in
`python_stdlib.zip` (<https://docs.python.org/3/license.html>).

Pyodide additionally downloads scientific packages **at runtime** into the directory named by
`PYODIDE_PACKAGE_CACHE_DIR`; these are fetched on demand and are **not** bundled in the installer.
They include NumPy and pandas (BSD-3-Clause) and Matplotlib (Matplotlib License, a
BSD-style/PSF-derived license). Each carries its own terms.

---

## 5. Tesseract OCR — Apache License 2.0

**Components:**

- `tesseract.js@7.0.0`, the OCR engine used for scanned PDF pages
  (`src/lib/server/rag/chunk/text-extract.ts`). Upstream:
  <https://github.com/naptha/tesseract.js>.
- `eng.traineddata`, the English trained-data model committed to this repository and shipped with
  the application, obtained from <https://github.com/tesseract-ocr/tessdata>.

**License:** Apache-2.0 for both, available at <https://www.apache.org/licenses/LICENSE-2.0>.
Tesseract OCR is copyright Google Inc. and contributors. Attribution notices are retained per
Apache-2.0 §4.

---

## 6. Language models downloaded at runtime

Model weights are **not** bundled in the installer. They are downloaded on demand from Hugging Face
when a user requests them, and each carries its own terms.

### Gemma models — Google Gemma Terms of Use

`unsloth/gemma-4-E2B-it-GGUF` and `unsloth/gemma-4-E4B-it-GGUF`, offered in Settings → local models
(`src/lib/constants/local-models.ts`).

**Gemma is not an OSI-approved open-source license.** Use is governed by the Gemma Terms of Use,
which impose use restrictions through Google's Gemma Prohibited Use Policy and require that these
terms be passed on to anyone who receives the model or a derivative of it.

- Gemma Terms of Use: <https://ai.google.dev/gemma/terms>
- Gemma Prohibited Use Policy: <https://ai.google.dev/gemma/prohibited_use_policy>

By downloading a Gemma model through this application, you agree to those terms.

### Other models

- `nomic-ai/nomic-embed-text-v1.5` — embeddings. Apache-2.0.
- `Xenova/whisper-tiny.en` — audio transcription. ONNX conversion of OpenAI Whisper (MIT).
- `Xenova/ms-marco-MiniLM-L-6-v2` — cross-encoder reranking. Apache-2.0.

---

## 7. Other bundled runtimes

| Component                   | Version | License                                                   |
| --------------------------- | ------- | --------------------------------------------------------- |
| Electron                    | 43.3.0  | MIT (bundles Chromium — BSD-3-Clause — and Node.js — MIT) |
| `node-llama-cpp`            | 3.19.1  | MIT (bundles llama.cpp — MIT)                             |
| `onnxruntime-node`          | 1.24.3  | MIT (ONNX Runtime, Microsoft)                             |
| `@huggingface/transformers` | 4.2.0   | Apache-2.0                                                |
| `@libsql/client`            | 0.17.4  | MIT (libSQL, a fork of SQLite — public domain)            |
| `sharp`                     | 0.35.3  | Apache-2.0 (see §2 for libvips)                           |
| `exceljs`                   | 4.4.0   | MIT                                                       |
| `pdf-parse`                 | 2.4.5   | MIT                                                       |

---

## 8. Permissively licensed dependencies

The remaining ~730 packages in the dependency tree are distributed under permissive licenses: MIT,
ISC, Apache-2.0, BSD-3-Clause, BSD-2-Clause, BlueOak-1.0.0, and single packages under 0BSD,
Unlicense, Python-2.0, WTFPL, and various dual-license combinations.
Their full license texts are included in the respective package directories under `node_modules/`.

Specific acknowledgements:

- **shadcn-svelte** — the 98 UI primitive files under `src/lib/components/ui/` were generated from
  the shadcn-svelte registry (<https://shadcn-svelte.com>). MIT, copyright Huntabyte and
  contributors.
- **bits-ui** (`2.18.1`) and **svelte-toolbelt** (`0.10.6`) — MIT, copyright Hunter Johnston and
  Thomas G. Lopes. Note that `svelte-toolbelt` omits the `license` field from its `package.json` but
  ships an MIT `LICENSE` file.
- **`buffers@0.1.1`** — reached transitively via `exceljs` → `unzipper` → `binary`. This package
  declares no license field and ships no license file. It is authored by James Halliday
  (substack), whose packages are conventionally MIT, but its terms are formally unstated upstream.
- **`dompurify`** (`3.4.14`) — dual-licensed (MPL-2.0 OR Apache-2.0); used here under Apache-2.0.
- **`jszip`** (`3.10.1`) — dual-licensed (MIT OR GPL-3.0-or-later); used here under MIT.
- **`youtubei.js`** (`18.0.0`) — MIT, copyright LuanRT. A client for YouTube's internal InnerTube
  API, used to look up a video's caption tracks. Pulls in `@bufbuild/protobuf` (dual
  **Apache-2.0 AND BSD-3-Clause** — both sets of terms apply), `fflate` (MIT), and `meriyah` (ISC).
- **`bgutils-js`** (`4.0.3`) — MIT, copyright LuanRT. Performs YouTube's BotGuard attestation to
  mint the proof-of-origin token that caption downloads now require. It executes an attestation
  program served by Google at runtime; that program is Google's code and is not redistributed here.
- **`jsdom`** (`30.0.1`) — MIT. Required only by the attestation step above, which runs browser
  code that expects a real DOM.

---

_Generated from the dependency tree resolved by `package-lock.json`. Regenerate this file when
adding a dependency that carries copyleft or use-restricted terms._
