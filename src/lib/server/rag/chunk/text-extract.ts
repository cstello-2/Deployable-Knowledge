import { readFile } from "node:fs/promises";
import scribe from "scribe.js-ocr";
import {
    normalizeWhitespace,
    type ExtractedChunk as Chunk,
    type Source,
} from "./parse-shared";

type ExtractTextFromTables = (
    page: any,
    layoutPage: any,
) => Array<{ rows?: string[][] }>;

const extractTextFromTables = scribe.extractTextFromTables as unknown as ExtractTextFromTables;

export type TextExtractionResult = {
    chunks: Chunk[];
    pageCount: number;
};

const IMAGE_OPERATOR_NAMES = [
    "paintImageXObject",
    "paintImageXObjectRepeat",
    "paintJpegXObject",
    "paintInlineImageXObject",
    "paintInlineImageXObjectGroup",
    "paintImageMaskXObject",
    "paintImageMaskXObjectGroup",
];

function hasMeaningfulOcrText(text: string): boolean {
    return (text.match(/[A-Za-z0-9]/g)?.length ?? 0) >= 10;
}

async function detectEmbeddedImagePages(filePath: string): Promise<Set<number>> {
    const imagePages = new Set<number>();

    try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
        const imageOps = new Set(
            IMAGE_OPERATOR_NAMES
                .map((name) => pdfjs.OPS[name])
                .filter((value) => typeof value === "number"),
        );
        const data = new Uint8Array(await readFile(filePath));
        const pdf = await pdfjs.getDocument({ data, disableWorker: true }).promise;

        try {
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                const page = await pdf.getPage(pageNumber);
                const ops = await page.getOperatorList();

                if (ops.fnArray.some((op: number) => imageOps.has(op))) {
                    imagePages.add(pageNumber - 1);
                }

                page.cleanup?.();
            }
        } finally {
            await pdf.destroy?.();
        }
    } catch (error) {
        console.warn("[Embedded Image Scan] Failed; continuing without image-aware OCR.", error);
    }

    return imagePages;
}

function tableRowsToText(rows: string[][]): string {
    return rows
        .map((row) =>
            row
                .map((cell) => normalizeWhitespace(String(cell ?? "")))
                .filter(Boolean)
                .join(" | "),
        )
        .filter(Boolean)
        .join("\n");
}

async function extractDocument(
    file: Source,
    doc: any,
    embeddedImagePages: Set<number>,
    ocr_langs: string[],
    mode: string,
): Promise<TextExtractionResult> {
    let chunks: Chunk[] = [];
    const nativeTextByPage = new Map<number, string>();
    let text_count = 0;
    let table_count = 0;

    const extractTextFromPage = (pageData: any) => {
        let pageTextContent: string[] = [];
        
        if (pageData.lines && pageData.lines.length > 0) {
            for (const line of pageData.lines) {
                if (line.words) {
                    pageTextContent.push(line.words.map((w: any) => w.text).join(" "));
                }
            }
        } else if (pageData.paragraphs) {
            for (const para of pageData.paragraphs || []) {
                for (const line of (para.lines || [])) {
                    if (line.words) {
                        pageTextContent.push(line.words.map((w: any) => w.text).join(" "));
                    }
                }
            }
        }
        return pageTextContent.join("\n").trim();
    };

    // openDocument automatically pulls native PDF text into doc.ocr.active
    if (doc.ocr && doc.ocr.active) {
        for (let i = 0; i < doc.ocr.active.length; i++) {
            const finalPageText = extractTextFromPage(doc.ocr.active[i]);
            if (finalPageText.length > 0) {
                nativeTextByPage.set(i, finalPageText);
                chunks.push({
                    chunkType: "TEXT", // Tagged  as  text
                    source: file,
                    pageIndex: i,
                    content: finalPageText,
                });
                text_count += 1;
            }
        }
    }

    const totalPages = doc.ocr?.active?.length || 0;
    const img_count = totalPages - text_count;
    
    console.log(`[Pre-OCR Scan] Total Pages: ${totalPages} | Native Text Pages: ${text_count} | Page OCR Fallbacks: ${img_count} | Embedded Image Pages: ${embeddedImagePages.size}`);

    //Running ocr
    await doc.recognize({ ocr_langs, mode });

    if (doc.ocr && doc.ocr.active) {
        for (let i = 0; i < doc.ocr.active.length; i++) {
            const hasEmbeddedImage = embeddedImagePages.has(i);
            const hasNativeText = nativeTextByPage.has(i);
            
            // Keep page OCR fallback, but also OCR native-text pages with embedded images
            if (hasNativeText && !hasEmbeddedImage) {
                continue; 
            }

            const ocrText = normalizeWhitespace(extractTextFromPage(doc.ocr.active[i]));
            const nativeText = normalizeWhitespace(nativeTextByPage.get(i) ?? "");
            
            if (ocrText && (!hasEmbeddedImage || (hasMeaningfulOcrText(ocrText) && ocrText !== nativeText))) {
                chunks.push({
                    chunkType: "IMAGE", // Tagged correctly as OCR'd text
                    source: file,
                    pageIndex: i,
                    content: hasEmbeddedImage ? `[Image: ${ocrText}]` : ocrText,
                });
            }
        }
    }

    if (doc.layoutDataTables && doc.layoutDataTables.pages) {
        for (let i = 0; i < doc.layoutDataTables.pages.length; i++) {
            const pageTables = doc.layoutDataTables.pages[i];
            
            // Check if the engine detected any tables on this specific page
            if (pageTables && pageTables.tables && pageTables.tables.length > 0) {
                const extractedTables = extractTextFromTables(doc.ocr.active?.[i], pageTables);
                for (let t = 0; t < pageTables.tables.length; t++) {
                    const tableData = pageTables.tables[t];
                    const rows = extractedTables[t]?.rows ?? [];
                    const title =
                        typeof tableData.title === "string"
                            ? normalizeWhitespace(tableData.title)
                            : "";
                    const tableText = tableRowsToText(rows);
                    const content = [title ? `Table: ${title}` : "", tableText]
                        .filter(Boolean)
                        .join("\n")
                        .trim();
                    if (!content) {
                        continue;
                    }
                    table_count += 1;

                    chunks.push({
                        chunkType: "TABLE", 
                        source: file,
                        pageIndex: i,
                        content,
                    });
                }
            }
        }
    }
    
    console.log("From: ", file.path ,"Images: ", img_count, " Text: ", text_count, " Tables: ", table_count);
    return {
        chunks,
        pageCount: totalPages,
    };
}

export async function TextExtract(
    file: Source,
    ocr_langs: string[] = ["eng"],
    mode: string = "quality",
): Promise<TextExtractionResult> {
    const embeddedImagePages = await detectEmbeddedImagePages(file.path);
    const doc = await scribe.openDocument([file.path]);

    try {
        return await extractDocument(file, doc, embeddedImagePages, ocr_langs, mode);
    } finally {
        await scribe.terminate();
    }
}
