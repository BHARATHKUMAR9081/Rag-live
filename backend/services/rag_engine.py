# Suppress TensorFlow logging warnings before anything is imported
import os
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import logging
import warnings
logging.getLogger("tensorflow").setLevel(logging.ERROR)
warnings.filterwarnings("ignore")

from pinecone import Pinecone
from fastembed import TextEmbedding
import uuid
from groq import Groq
import json

class RAGEngine:
    def __init__(self, embedding_model="all-MiniLM-L6-v2"):
        # Initialize Pinecone
        pinecone_api_key = os.environ.get("PINECONE_API_KEY")
        if pinecone_api_key:
            pc = Pinecone(api_key=pinecone_api_key)
            index_name = os.environ.get("PINECONE_INDEX_NAME", "antirag")
            self.index = pc.Index(index_name)
        else:
            self.index = None
            print("Warning: PINECONE_API_KEY not found. Vector DB operations will fail.")
            
        # Initialize Groq Client
        self.groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        self.llm_model = "llama-3.3-70b-versatile"
        
        # Initialize fastembed (ONNX runtime) for memory efficiency
        self.encoder = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")

    def add_chunks(self, chunks):
        """Adds PDF chunks to Pinecone"""
        if not chunks or not self.index:
            return 0
            
        vectors = []
        for c in chunks:
            text = c["text"]
            metadata = c["metadata"]
            # Pinecone requires metadata values to be strings, numbers, booleans, or lists of strings.
            # We must store the actual text in metadata so we can retrieve it later.
            metadata["text"] = text
            
            chunk_id = str(uuid.uuid4())
            embedding = list(self.encoder.embed([text]))[0].tolist()
            
            vectors.append({
                "id": chunk_id,
                "values": embedding,
                "metadata": metadata
            })
        
        # Upsert in batches of 100
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            self.index.upsert(vectors=vectors[i:i+batch_size])
            
        return len(chunks)

    def query_stream(self, question, top_k=3):
        """Queries Pinecone and uses Groq API to generate a streamed answer"""
        if not self.index:
            yield json.dumps({"type": "chunk", "data": "Error: Pinecone is not configured."}) + "\n"
            return

        # Embed question
        query_embedding = list(self.encoder.embed([question]))[0].tolist()
        
        # Search DB
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True
        )
        
        if not results.get('matches'):
            yield json.dumps({"type": "chunk", "data": "I couldn't find any relevant information in the uploaded documents."}) + "\n"
            return
            
        # Format sources and context
        context_texts = []
        sources = []
        
        for match in results['matches']:
            metadata = match.get('metadata', {})
            doc_text = metadata.get('text', '')
            page_num = metadata.get('page_number', 'Unknown')
            
            context_texts.append(f"Content from page {page_num}:\n{doc_text}")
            
            image_paths = []
            if metadata.get("image_paths"):
                image_paths = metadata["image_paths"].split(",")
                
            sources.append({
                "page_number": page_num,
                "file_id": metadata.get('file_id', 'Unknown'),
                "text_snippet": doc_text[:100] + "...",
                "images": image_paths
            })
            
        context = "\n\n---\n\n".join(context_texts)
        
        # Yield the sources first
        yield json.dumps({"type": "sources", "data": sources}) + "\n"
        
        # Prompt for Groq LLM
        prompt = f"""You are an intelligent PDF assistant. Answer the user's question based strictly on the extracted context below. 
If the context doesn't contain the answer, say you don't know based on the context. Always mention the page numbers listed in the context in your response.
CRITICAL RULE: If the original text in the context is formatted as a Markdown table (or visibly structured as a table), preserve that table format in your response. Do NOT create your own tables unless the data was explicitly a table in the source document.

Context:
{context}

Question: {question}

Answer:"""

        # Call Groq API with streaming enabled
        try:
            stream = self.groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                model=self.llm_model,
                stream=True
            )
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    yield json.dumps({"type": "chunk", "data": chunk.choices[0].delta.content}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "chunk", "data": f"Error communicating with Groq API: {e}. Check your API Key."}) + "\n"

    def get_all_documents(self):
        """Returns a list of unique file_ids. For Pinecone, we do a dummy query to fetch recent ones."""
        if not self.index:
            return []
            
        # Dummy query to get recent docs (Pinecone serverless doesn't have list metadata easily)
        dummy_vector = [0.0] * 384 # Dimension of all-MiniLM-L6-v2
        results = self.index.query(
            vector=dummy_vector,
            top_k=1000,
            include_metadata=True
        )
        
        file_ids = set()
        for match in results.get('matches', []):
            metadata = match.get('metadata', {})
            if "file_id" in metadata:
                file_ids.add(metadata["file_id"])
                
        return sorted(list(file_ids))

    def delete_document(self, file_id):
        """Deletes chunks by file_id if Pinecone allows metadata filtering on delete"""
        if not self.index:
            return False
            
        try:
            self.index.delete(filter={"file_id": file_id})
            return True
        except Exception as e:
            print(f"Error deleting from Pinecone: {e}")
            return False
