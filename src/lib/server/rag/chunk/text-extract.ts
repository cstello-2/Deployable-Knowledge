import scribe from 'scribe.js-ocr';
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

//See bottom of file for example function usage and type declarations

export async function TextExtract(file: Source, ocr_langs: string[] = ["eng"], mode: string = "quality") { //speed or quality
    const doc = await scribe.openDocument([file.path]);
    let chunks: Chunk[] = [];
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
    
    console.log(`[Pre-OCR Scan] Total Pages: ${totalPages} | Native Text Pages: ${text_count} | Images Awaiting OCR: ${img_count}`);

    // Keep track of which pages we already extracted native text from
    const nativelyExtractedPages = chunks.map(c => c.pageIndex);

    //Running ocr
    await doc.recognize({ ocr_langs, mode });

    if (doc.ocr && doc.ocr.active) {
        for (let i = 0; i < doc.ocr.active.length; i++) {
            
            // Skip this page if we already got native text for it
            if (nativelyExtractedPages.includes(i)) {
                continue; 
            }

            const finalPageText = extractTextFromPage(doc.ocr.active[i]);
            
            if (finalPageText.length > 0) {
                chunks.push({
                    chunkType: "IMAGE", // Tagged correctly as OCR'd text
                    source: file,
                    pageIndex: i,
                    content: finalPageText,
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
    await scribe.terminate();
    return chunks;
}


// let new_file: Source = {

//         title: "tcc.pdf",

//         type: "PDF",

//         path: "tcc.pdf",

//     };


// TextExtract(new_file); 
