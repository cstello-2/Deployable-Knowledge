import BM25
import bm25s
import Stemmer
import argparse

from pathlib import Path
#from fastapi import FastAPI
from core.rag.chunking import parse_pdf

'''
TO RUN
IN TERMINAL 
 python -m core.rag.new_bm25

'''
def getCorpus():
    print("Getting corpus...")
    #searches for PDFs in the documents folder
    corpusGet = []
    
    BASE_DIR = Path.cwd()
    for i in Path(BASE_DIR / "documents").glob("*.pdf"):
        corpusGet.append(parse_pdf(i))

    corpusText = []
    corpusData = []
    
    for pageDict in corpusGet:
        for j in pageDict:
            corpusText.append(j["text"])

    for pageDict in corpusGet:
        for j in pageDict:
            corpusData.append(j["page"])
    
    return corpusText, corpusData

#This function is meant purely for the test testing
#Please remove when you are ready to make use of this
def testQuery():
    print("Getting query...")
    query = "How do I perform a 9-line when reporting an injured soldier?"
    
    return query 

"""
app = FastAPI()
@app.get("/search")
def getQuery(q: str):
    #Code stolen from ./api/routers/search.py
    queryGet = q
    print(queryGet)
    return queryGet
   """

def tokenizeCorpus(corpusText):
    #stemmer -> reduces words to their root form
    #runner, ran -> run
    print("Tokenizing corpus...")
    stem = Stemmer.Stemmer('english')
    
    #builds a search index for the corpus using BM25
    corpusTokens = bm25s.tokenize(corpusText, stopwords="english", stemmer=stem)
    corpusIndex = bm25s.BM25()
    corpusIndex.index(corpusTokens)
    
    return corpusIndex

def tokenizeQuery(queryText):
    print("Tokenizing query...")
    #Tokenizes the query for searching
    stem = Stemmer.Stemmer('english')
    queryTokens = bm25s.tokenize(queryText, stopwords="english", stemmer=stem)
    
    return queryTokens

def ranker(queryTokens, corpusIndex):
    print("Ranking results...")
    #Shoves the queryTokens and the corpusTokens into the BM25 retriever to get ranked results
    results, scores = corpusIndex.retrieve(queryTokens, k=10, sorted=True)
    
    return results, scores

def finalResults(results, scores, corpusText, corpusData):
    print("Final results:")
    #stolen from the BM25s GitHub readme
    #prints the ranked results
    for i in range(results.shape[1]):
        doc, score = results[0, i], scores[0, i]
        print(f"\nRank {i+1} (score: {score:.2f}): {doc} \n")
        #print('\n' + corpusText[doc])
        print("Page number: " + str(corpusData[doc]))

def main():
    #Main function
    #executes the above functions w/ the parameters 
    corpus, pageNum = getCorpus()
    #query = getQuery()
    
    #Testing query 
    query = testQuery()
    
    corpusIndex = tokenizeCorpus(corpus)
    queryTokens = tokenizeQuery(query)
    results, scores = ranker(queryTokens, corpusIndex)
    finalResults(results, scores, corpus, pageNum)
    print("Done")

main()