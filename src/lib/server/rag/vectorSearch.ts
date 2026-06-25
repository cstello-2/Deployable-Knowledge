import { pipeline } from '@xenova/transformers';
import { Voy } from 'voy-search';

interface docTemplate{
    text: string;
    source: string;
    score: number;
    page: number | null;
    contentType: string;
    imageIndex: number | null;
    segmentID: string;
}


function exactQueryTerms(query: string)
{
    var term = query;

    //Testing for serial #s and modelIDs with this
    //Copied from my best friend, Claude 
    const regex = /[A-Za-z0-9][A-Za-z0-9-]{4,}[A-Za-z0-9]/g;

    //Uses the match function to see if there are any of the terms in query
    // '|| []' defaults to an empty array
    const returnMe = query.match(regex) || []

    //Filter the matches to ensure at least one digit (0-9) exists in the term
    returnMe.filter(term => /\d/.test(term));

    return returnMe;
}

function resultsFromDoc()
{

}

function search()
{   
    /*
    *   This uses two different JS libraries: Voy and Transformers.js(?)
        Voy is a vector simularity search 
        Transformers.js is used for the embedding
    */

    //Makes a vector database using Voy
    const voyIndex = new Voy();

    //Uses the AI embedding model 
    const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    //TEMP CODE!!!
    //Ima have to steal Ethan's code at some point
    //I need to see how the SQL database is working here 

    //Generates a vector for the document 
    let docText = "How do I perform a 9-line for an injured soldier?";


}