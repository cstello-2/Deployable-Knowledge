import BM25 
import bm25s 
import Stemmer 
import argparse 
from pathlib import Path 
from core.rag.chunking import parse_pdf

def getCorpus(): 
    #TODO: LOAD THE CORPUS' TEXTSTREAMS INTO A LIST corpusGet = []
    return corpusGet

def getQuery(): 
    #TODO: LOAD THE QUERY'S TEXTSTREAM INTO A STRING queryGet = ""
    return queryGet

def tokenizeCorpus(corpusText): 
    #stemmer -> reduces words to their root form #runner, ran -> run stem = Stemmer.Stemmer('english')
    #builds a search index for the corpus using BM25
    corpusTokens = bm25s.tokenize(corpusText, stopwords="english", stemmer=stem)
    corpusIndex = bm25s.BM25()
    corpusIndex.index(corpusTokens)
    return corpusIndex
def tokenizeQuery(queryText): 
    # Tokenizes the query for searching stem = Stemmer.Stemmer('english') queryTokens = bm25s.tokenize(queryText, stopwords="english", stemmer=stem)
    return queryTokens

def ranker(queryTokens, corpusIndex): 
    #Shoves the queryTokens and the corpusTokens into the BM25 retriever to get ranked results results, scores = corpusIndex.retrieve(queryTokens, k=10, sorted=True) return results, scores

def finalResults(results, scores):
    #stolen from the BM25s GitHub readme #prints the ranked results for i in range(results.shape[1]): doc, score = results[0, i], scores[0, i] print(f"Rank {i+1} (score: {score:.2f}): {doc}")

def main():
     corpus = getCorpus() query = getQuery() corpusIndex = tokenizeCorpus(corpus) queryTokens = tokenizeQuery(query) results, scores = ranker(queryTokens, corpusIndex) finalResults(results, scores)