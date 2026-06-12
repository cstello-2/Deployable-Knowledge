
import bm25s
import Stemmer
import argparse

from core.sessions import KnowledgeBaseStore
from sqlmodel import Session

from config import CHROMA_DB_DIR, COLLECTION_NAME
from pathlib import Path
#from fastapi import FastAPI
from core.rag.chunking import parse_pdf
from core.rag.chunking import extract_pdf_images
from contextlib import contextmanager
from core.ocr.pdf_image_ocr import extract_pdf_image_segments
from core.rag.retriever import get_db
from core.database import engine, init_db
from core.database.models import BM25ChunkRecord, BM25FileRecord, utc_now
import sys, os

'''
TO RUN
IN TERMINAL 
 python -m core.rag.new_bm25

'''

#Purely for testing purposes
#Suppresses # printing to the console 
#This is done because extract_pdf_images wants to # print everything

@contextmanager
def suppress_stdout():
    with open(os.devnull, "w") as devnull:
        old_stdout = sys.stdout
        sys.stdout = devnull
        try:  
            yield
        finally:
            sys.stdout = old_stdout

def getCorpus(query, top_k, exclude):
    # print("Getting corpus...")
    #searches for PDFs in the documents folder

    # embedding = get_db().embed([query])[0]
    # results = get_db().collection.query(query_embeddings=[embedding], n_results=top_k)

    # # print(embedding)
    # # print("Here lies the results" + str(results) + "There are no more results")

    kb_store = KnowledgeBaseStore()
    all_chunks = kb_store.get_all_chunks()
    # for x in all_chunks:
    #     # print(x)

    # corpusGet = []
    # corpusPicGet = []
    
    # BASE_DIR = Path.cwd()
    # for temp_path in Path(BASE_DIR / "documents").glob("*.pdf"):
    #     #Gives corpusGet the page text & page number
    #     corpusGet.append(parse_pdf(temp_path))
    #     #Gives corpusGet the information on the images present on the page
    #     corpusPicGet.append(extract_pdf_images(temp_path))
    #     #corpusPicGet.append(extract_pdf_image_segments(temp_path))

    #Seperates the text, page numbers, and the picture data into 2 lists and one list of dictionaries 
    
    
    corpusText = []
    corpusPageNum = []
    corpusPicData = []
    
    for entry in all_chunks:
        corpusText.append(entry.text)
        corpusPageNum.append(entry.page)
        corpusPicData.append({"file_name": entry.file_name, "page": entry.page})

    # # print(get_db())
    # embedding = get_db().embed([query])[0]
    # results = get_db().collection.query(query_embeddings=[embedding], n_results=top_k)
    
    return corpusText, corpusPageNum, corpusPicData 

#This function is meant purely for the test testing
#Please remove when you are ready to make use of this
def testQuery():
    # print("Getting query...")
    query = "How do I perform a 9-line when reporting an injured soldier?"
    
    return query 

"""
app = FastAPI()
@app.get("/search")
def getQuery(q: str):
    #Code stolen from ./api/routers/search.py
    queryGet = q
    # print(queryGet)
    return queryGet
   """

def tokenizeCorpus(corpusText):
    #stemmer -> reduces words to their root form
    #runner, ran -> run
    # print("Tokenizing corpus...")
    stem = Stemmer.Stemmer('english')
    
    #builds a search index for the corpus using BM25
    corpusTokens = bm25s.tokenize(corpusText, stopwords="english", stemmer=stem)
    corpusIndex = bm25s.BM25()
    corpusIndex.index(corpusTokens)
    
    return corpusIndex

def tokenizeQuery(queryText):
    # print("Tokenizing query...")
    #Tokenizes the query for searching
    stem = Stemmer.Stemmer('english')
    queryTokens = bm25s.tokenize(queryText, stopwords="english", stemmer=stem)
    
    return queryTokens

def ranker(queryTokens, corpusIndex, top_k):
    # print("Ranking results...")
    #Shoves the queryTokens and the corpusTokens into the BM25 retriever to get ranked results
    results, scores = corpusIndex.retrieve(queryTokens, k=int(top_k), sorted=True)
    
    return results, scores

def finalResults(results, scores, corpusText, corpusData, picData, top_k):
    # print("Final results:")
    #stolen from the BM25s GitHub readme
    ## prints the ranked results
    collectedResults = []
    for i in range(results.shape[1]):
        doc, score = results[0, i], scores[0, i]

        collectedResults.append(
            {
                "text": str(corpusText[doc]).strip().replace("\n", " "),
                "source": str(picData[doc]["file_name"]),
                "score": float(score),
                "page": str(corpusData[doc]),
                "content_type": "text",
                "image_index": None,
                "segment_id": 1,
            }
        )

        # print(collectedResults)
        
        # # print(f"\nRank {i+1} (score: {score:.2f}): {doc} \n")
        # # print('\n' + corpusText[doc])
        # # print(str(picData[doc]))
        # # print("Page number: " + str(corpusData[doc]))

        # for x in picData:
        #     if x["page"] == corpusData[doc]:
        #         # print(x)

    return collectedResults

def run_bm(query, top_k, exclude_sources):
    #Main function
    #executes the above functions w/ the parameters 
    corpus, pageNum, picData = getCorpus(query, top_k, exclude_sources)
    #query = getQuery()
    
    #Testing query 
    #query = testQuery()
    
    corpusIndex = tokenizeCorpus(corpus)
    queryTokens = tokenizeQuery(query)
    results, scores = ranker(queryTokens, corpusIndex, top_k)
    collectedResults = finalResults(results, scores, corpus, pageNum, picData, top_k)
    return collectedResults

# run_bm("How do I perform a 9-line when reporting an injured soldier?", 2, [])