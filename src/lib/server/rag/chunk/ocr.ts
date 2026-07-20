import { createWorker, OEM, PSM, type Worker } from "tesseract.js";

// Shared Tesseract worker config for OCR-ing embedded images
export async function createOcrWorker(): Promise<Worker> {
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    cacheMethod: "readOnly",
    cachePath: process.cwd(),
    gzip: false,
    langPath: process.cwd(),
    logger: () => {},
  });

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    user_defined_dpi: "300",
    debug_file: "/dev/null",
  });

  return worker;
}
