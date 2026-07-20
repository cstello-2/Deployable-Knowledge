import { createHash } from "node:crypto";
import { OfficeParser, type OfficeContentNode } from 'officeparser';
import {
    normalizeWhitespace,
    type ExtractedChunk as Chunk,
    type Source,
} from "./parse-shared";
import type { TextExtractionResult } from "./text-extract";
import { createOcrWorker } from "./ocr";

// Docx has no real pagination, so this is a volume-based approximation
const CHARS_PER_PAGE = 1800;

// Below this, Tesseract confidence reliably means decorative graphic, not text
const OCR_CONFIDENCE_THRESHOLD = 40;

export async function DocxExtract(file: Source): Promise<TextExtractionResult>
{
    const chunks: Chunk[] = [];
    const ast = await OfficeParser.parseOffice(file.path,
    {
        extractAttachments: true,
        // officeparser's built-in OCR reads dense screenshots poorly; OCR ourselves instead
        ocr: false,
    });

    let pageIndex = 0;
    let charsOnPage = 0;
    let textBuffer = "";

    function flushTextBuffer() {
        if (!textBuffer) return;
        chunks.push({ chunkType: "TEXT", source: file, pageIndex, content: textBuffer });
        textBuffer = "";
    }

    function pushChunk(chunkType: Chunk["chunkType"], content: string) {
        if (charsOnPage > 0 && charsOnPage + content.length > CHARS_PER_PAGE) {
            flushTextBuffer();
            pageIndex += 1;
            charsOnPage = 0;
        }
        charsOnPage += content.length;

        if (chunkType === "TEXT") {
            textBuffer += (textBuffer ? "\n" : "") + content;
        } else {
            flushTextBuffer();
            chunks.push({ chunkType, source: file, pageIndex, content });
        }
    }

    const ocrWorker = await createOcrWorker();

    // Keyed by content hash, not filename - repeated logos get re-embedded under new names
    const ocrCache = new Map<string, string>();

    type OcrResult = { text: string; hash: string };

    async function ocrAttachment(attachmentName: string): Promise<OcrResult | undefined> {
        const attachment = ast.attachments.find((a) => a.name === attachmentName);
        if (!attachment) return undefined;

        const buffer = Buffer.from(attachment.data, "base64");
        const hash = createHash("sha256").update(buffer).digest("hex");

        const cached = ocrCache.get(hash);
        if (cached !== undefined) return { text: cached, hash };

        const { data } = await ocrWorker.recognize(buffer);
        const text = data.confidence >= OCR_CONFIDENCE_THRESHOLD ? data.text : "";
        ocrCache.set(hash, text);
        return { text, hash };
    }

    // Avoids pushing a duplicate chunk for the same image embedded more than once
    const pushedImageHashes = new Set<string>();

    for (const node of ast.content)
    {
        if (node.type === 'table')
        {
            const content = tableNodeToText(node);
            if (content) {
                pushChunk("TABLE", content);
            }
        }
        else if (node.type === "paragraph" || node.type === "heading" || node.type === "list")
        {
            const rawText = normalizeWhitespace(node.text ?? "");
            const content = node.type === "list" ? formatListItem(node, rawText) : rawText;

            if (content) {
                pushChunk("TEXT", content);
            }
        }
        // Images are nested inside paragraphs/cells, not top-level siblings
        for (const imageNode of collectImageNodes(node)) {
            if (imageNode.type !== "image") continue;
            const attachmentName = imageNode.metadata?.attachmentName;
            if (!attachmentName) continue;

            const result = await ocrAttachment(attachmentName);
            if (!result || pushedImageHashes.has(result.hash)) continue;
            pushedImageHashes.add(result.hash);

            const content = normalizeWhitespace(result.text);
            if (content) {
                pushChunk("IMAGE", content);
            }
        }
    }

    flushTextBuffer();
    await ocrWorker.terminate();

    return { chunks, pageCount: pageIndex + 1 };
}

// officeparser doesn't expose which row is the header, so assume the first row is
function tableNodeToText(tableNode: OfficeContentNode): string {
    const rows = (tableNode.children ?? [])
        .map((row) => (row.children ?? []).map((cell) => normalizeWhitespace(cell.text ?? "")))
        .filter((row) => row.some(Boolean));

    if (rows.length === 0) return "";

    const columnCount = Math.max(...rows.map((row) => row.length));
    const padded = rows.map((row) => {
        const cells = [...row];
        while (cells.length < columnCount) cells.push("");
        return cells;
    });

    const [headerRow, ...bodyRows] = padded;
    const lines = [
        `| ${headerRow.join(" | ")} |`,
        `| ${headerRow.map(() => "---").join(" | ")} |`,
        ...bodyRows.map((row) => `| ${row.join(" | ")} |`),
    ];

    return lines.join("\n");
}

// Word stores the bullet/number separately from the text - reconstruct it
function formatListItem(node: OfficeContentNode, text: string): string {
    if (!text || node.type !== "list") return text;

    const metadata = node.metadata;
    const indent = "  ".repeat(metadata?.indentation ?? 0);
    const marker = metadata?.listType === "ordered" ? `${(metadata.itemIndex ?? 0) + 1}.` : "-";

    return `${indent}${marker} ${text}`;
}

// Finds every image node nested anywhere under this node
function collectImageNodes(node: OfficeContentNode, found: OfficeContentNode[] = []): OfficeContentNode[] {
    if (node.type === "image") {
        found.push(node);
    }
    for (const child of node.children ?? []) {
        collectImageNodes(child, found);
    }
    return found;
}
