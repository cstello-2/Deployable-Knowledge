import scribe from 'scribe.js-ocr';

export type MediaType = "PDF";
export type ChunkType = "TEXT" | "IMAGE" | "TABLE";

export type Chunk = {
    chunkType: ChunkType;
    source: Source;
    pageIndex: Number;
    content: string | any[];
};

export type Source = {
    title: string;
    type: MediaType;
    path: string;
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
                for (let t = 0; t < pageTables.tables.length; t++) {
                    table_count += 1;

                    const tableData = pageTables.tables[t];

                    const page = tableData.page;
                    const boxes = tableData.boxes;
                    const title = tableData.title;
                    
                    // You can use scribe's internal helpers, or manually parse the table cells
                    // into your desired string format (e.g., CSV or Markdown)
                    
                    chunks.push({
                        chunkType: "TABLE", 
                        source: file,
                        pageIndex: i,
                        content: [page, boxes, title],
                    });
                }
            }
        }
    }

    //console.log("Separated Chunks:", chunks);
    console.log("From: ", file.path ,"Images: ", img_count, " Text: ", text_count, " Tables: ", table_count);

    await doc.terminate();
    await scribe.terminate();

    return chunks;
}


// let new_file: Source = {

//         title: "tcc.pdf",

//         type: "PDF",

//         path: "tcc.pdf",

//     };


// TextExtract(new_file); 