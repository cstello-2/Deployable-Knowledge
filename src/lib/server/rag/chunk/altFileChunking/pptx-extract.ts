import { createHash } from "node:crypto";
import {
  OfficeParser,
  type ImageMetadata,
  type OfficeContentNode,
  type SlideMetadata,
} from "officeparser";
import {
  normalizeWhitespace,
  type ExtractedChunk as Chunk,
  type Source,
} from "../parse-shared";
import type { TextExtractionResult } from "../text-extract";
import { createOcrWorker } from "../ocr";

// Below this, Tesseract confidence reliably means decorative graphic, not text
const OCR_CONFIDENCE_THRESHOLD = 40;

// Unlike DOCX, a PPTX's slides are a real structural boundary already present in the file
// (officeparser's top-level content array is exactly one node per slide, in order), so
// pageIndex here is the actual slide number - no volume-based approximation needed.
export async function PptxExtract(file: Source): Promise<TextExtractionResult> {
  const chunks: Chunk[] = [];
  const ast = await OfficeParser.parseOffice(file.path, {
    extractAttachments: true,
    // officeparser's built-in OCR reads dense screenshots poorly; OCR ourselves instead
    ocr: false,
  });

  const slides = ast.content ?? [];
  const ocrWorker = await createOcrWorker();

  // Keyed by content hash, not filename - repeated logos get re-embedded under new names
  const ocrCache = new Map<string, string>();
  const attachments = ast.attachments ?? [];

  type OcrResult = { text: string; hash: string };

  async function ocrAttachment(attachmentName: string): Promise<OcrResult | undefined> {
    const attachment = attachments.find((a) => a.name === attachmentName);
    if (!attachment) return undefined;

    const buffer = Buffer.from(attachment.data, "base64");
    const hash = createHash("sha256").update(buffer).digest("hex");

    const cached = ocrCache.get(hash);
    if (cached !== undefined) return { text: cached, hash };

    let text = "";

    try {
      const { data } = await ocrWorker.recognize(buffer);
      const confidence = Number(data?.confidence ?? 0);
      text = confidence >= OCR_CONFIDENCE_THRESHOLD ? data?.text ?? "" : "";
    } catch (error) {
      console.warn(`[PPTX OCR] Failed to recognize image "${attachmentName}".`, error);
    }

    ocrCache.set(hash, text);
    return { text, hash };
  }

  const pushedImageHashes = new Set<string>();

  async function processImageNode(imageNode: OfficeContentNode, pageIndex: number): Promise<void> {
    const attachmentName = (imageNode.metadata as ImageMetadata | undefined)?.attachmentName;
    if (!attachmentName) return;

    const result = await ocrAttachment(attachmentName);
    if (!result || pushedImageHashes.has(result.hash)) return;
    pushedImageHashes.add(result.hash);

    const content = normalizeWhitespace(result.text);
    if (content) {
      chunks.push({ chunkType: "IMAGE", source: file, pageIndex, content });
    }
  }

  // Text nodes are collected here instead of pushed as their own chunk - a lone title or
  // short bullet rarely clears MIN_WORDS on its own, so joining them into one chunk per
  // slide (below) mirrors how TextExtract pools a whole PDF page into one chunk.
  async function processContentNode(
    node: OfficeContentNode,
    pageIndex: number,
    textLines: string[],
  ): Promise<void> {
    if (node.type === "table") {
      const content = tableNodeToText(node);
      if (content) {
        chunks.push({ chunkType: "TABLE", source: file, pageIndex, content });
      }

      for (const imageNode of collectImageNodes(node)) {
        await processImageNode(imageNode, pageIndex);
      }

      return;
    }

    if (node.type === "paragraph" || node.type === "heading" || node.type === "list" || node.type === "text") {
      const rawText = normalizeWhitespace(node.text ?? "");
      const content = node.type === "list" ? formatListItem(node, rawText) : rawText;

      if (content) {
        textLines.push(content);
      }

      for (const imageNode of collectImageNodes(node)) {
        await processImageNode(imageNode, pageIndex);
      }

      return;
    }

    if (node.type === "image") {
      await processImageNode(node, pageIndex);
      return;
    }

    for (const child of node.children ?? []) {
      await processContentNode(child, pageIndex, textLines);
    }
  }

  try {
    for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
      const slideNode = slides[slideIndex];
      const slideNumber = Number(
        (slideNode.metadata as SlideMetadata | undefined)?.slideNumber ?? slideIndex + 1,
      );
      // slideNumber is 1-based in the AST; pageIndex is 0-based everywhere else in the app
      const pageIndex = slideNumber - 1;
      const textLines: string[] = [];

      for (const child of slideNode.children ?? []) {
        await processContentNode(child, pageIndex, textLines);
      }

      if (textLines.length > 0) {
        chunks.push({ chunkType: "TEXT", source: file, pageIndex, content: textLines.join("\n") });
      }
    }
  } finally {
    await ocrWorker.terminate();
  }

  return { chunks, pageCount: slides.length };
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

// PowerPoint stores the bullet/number separately from the text - reconstruct it
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
