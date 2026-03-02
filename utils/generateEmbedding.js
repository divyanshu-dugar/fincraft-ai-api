/** 
* Converts a text string into a vector embedding using OpenAI's API.
* @param {string} text - The input text to be converted into an embedding.
* @returns {Promise<number[]>} - The 1536-dimensional vector embedding representing the input text.
*/

async function generateEmbedding(text){
    try{
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text
        });

        return response.data[0].embedding;
    }catch (error) {
        console.error("Error generating embedding:", error);
        return null;
    }
}

module.exports = generateEmbedding;