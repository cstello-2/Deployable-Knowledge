interface Document
{
    page: string | number;
    source: string;
    score?: number;
    [key: string]: any; // Allows for any other dynamic fields you might have
}

function reRankData(bm25Rank: Document[], vectorRank: Document[]): Document[]
{
    let bm25 = bm25Rank;
    let vector = vectorRank; 
    
    let counter = 1;
    const weightBM25 = 0.411111;
    const weightVec = 0.588888;

    // Assign ranks to BM25
    for (let i of bm25) 
    {
        i["score"] = counter; 
        counter = counter + 1;
    }
    
    // Assign ranks to Vector
    counter = 1;
    for (let j of vector) 
    {
        j["score"] = counter; 
        counter = counter + 1;
    }

    const reRankedScores: Document[] = [];
    const matchedPages: (string | number)[] = []; // Keeps track of pages we already merged

    // Loop through BM25 and look for matches in Vector
    for (let doc of bm25) 
    {
        const bmScore = weightBM25 / (60 + (doc["score"] || 0));
        let vecScore = weightVec / (60 + 100); // Default penalty rank
        
        for (let docV of vector) 
        {
            if (doc["page"] === docV["page"] && doc["source"] === docV["source"]) 
            {
                vecScore = weightVec / (60 + (docV["score"] || 0));
                matchedPages.push(docV["page"]); // Mark as matched
            }
        }
                
        const newScore = bmScore + vecScore; 
        doc["score"] = newScore; 
        reRankedScores.push(doc);
    }

    // Loop through Vector for anything that didn't match BM25
    for (let k of vector) 
    {
        if (!matchedPages.includes(k["page"])) {
            const bmScore = weightBM25 / (60 + 100); // Default penalty rank
            const vecScore = weightVec / (60 + (k["score"] || 0)); 
            const newScore = bmScore + vecScore;

            k["score"] = newScore; 
            reRankedScores.push(k);
        }
    }

    // Sort by score in descending order
    return reRankedScores.sort((a, b) => (b.score || 0) - (a.score || 0));
}