import bm25s
import Stemmer
import argparse


from config import CHROMA_DB_DIR, COLLECTION_NAME
from pathlib import Path
#from fastapi import FastAPI
from core.rag.chunking import parse_pdf
from core.rag.chunking import extract_pdf_images
from contextlib import contextmanager
import sys, os

'''
TO RUN
IN TERMINAL 
 python -m core.rag.new_bm25

'''

#Purely for testing purposes
#Suppresses printing to the console 
#This is done because extract_pdf_images wants to print everything

@contextmanager
def suppress_stdout():
    with open(os.devnull, "w") as devnull:
        old_stdout = sys.stdout
        sys.stdout = devnull
        try:  
            yield
        finally:
            sys.stdout = old_stdout

def getCorpus():
    print("Getting corpus...")
    #searches for PDFs in the documents folder
    corpusGet = []
    corpusPicGet = []
    
    BASE_DIR = Path.cwd()
    for i in Path(BASE_DIR / "documents").glob("*.pdf"):
        #Gives corpusGet the page text & page number
        corpusGet.append(parse_pdf(i))
        #Gives corpusGet the information on the images present on the page
        with suppress_stdout():
            corpusPicGet.append(extract_pdf_images(i))

    #Seperates the text, page numbers, and the picture data into 2 lists and one list of dictionaries 
    corpusText = []
    corpusPageNum = []
    corpusPicData = []
    
    for pageDict in corpusGet:
        for j in pageDict:
            corpusText.append(j["text"])

    for textDict in corpusGet:
        for x in textDict:
            corpusPageNum.append(x["page"])

    for picInfo in corpusPicGet:
        corpusPicData.extend(picInfo)
    
    return corpusText, corpusPageNum, corpusPicData 

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

def finalResults(results, scores, corpusText, corpusData, picData):
    print("Final results:")
    #stolen from the BM25s GitHub readme
    #prints the ranked results
    for i in range(results.shape[1]):
        doc, score = results[0, i], scores[0, i]
        print(f"\nRank {i+1} (score: {score:.2f}): {doc} \n")
        #print('\n' + corpusText[doc])
        #print(str(picData[doc]))
        print("Page number: " + str(corpusData[doc]))

        for x in picData:
            if x["page"] == corpusData[doc]:
                print(x)

def main():
    #Main function
    #executes the above functions w/ the parameters 
    corpus, pageNum, picData = getCorpus()
    #query = getQuery()
    
    #Testing query 
    query = testQuery()
    
    corpusIndex = tokenizeCorpus(corpus)
    queryTokens = tokenizeQuery(query)
    results, scores = ranker(queryTokens, corpusIndex)
    finalResults(results, scores, corpus, pageNum, picData)
    print("Done")

main()