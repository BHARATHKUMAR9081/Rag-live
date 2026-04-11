# Suppress TensorFlow logging warnings before anything is imported
import os
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import logging
import warnings
logging.getLogger("tensorflow").setLevel(logging.ERROR)
warnings.filterwarnings("ignore")

import chromadb
from sentence_transformers import SentenceTransformer
import uuid
import requests

class RAGEngine:
    def __init__(self, db_path="./chroma_db", embedding_model="all-MiniLM-L6-v2", ollama_url="http://localhost:11434"):
        # Initialize Vector DB
        self.chroma_client = chromadb.PersistentClient(path=db_path)
        self.collection = self.chroma_client.get_or_create_collection(name="pdf_documents")
        
        # Initialize Sentence Transformer for embeddings
        self.encoder = SentenceTransformer(embedding_model)
        
        self.ollama_url = ollama_url
        self.ollama_model = "llama3" # Default, user should have pulled this

    def add_chunks(self, chunks):
        """Adds PDF chunks to ChromaDB"""
        if not chunks:
            return 0
            
        texts = [c["text"] for c in chunks]
        metadatas = [c["metadata"] for c in chunks]
        ids = [str(uuid.uuid4()) for _ in chunks]
        
        embeddings = self.encoder.encode(texts).tolist()
        
        self.collection.add(
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
            ids=ids
        )
        return len(chunks)

    def query_stream(self, question, top_k=3):
        import json
        
        """Queries the vector DB and uses Ollama to generate a streamed answer"""
        # Embed question
        query_embedding = self.encoder.encode([question]).tolist()
        
        # Search DB
        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=top_k
        )
        
        if not results['documents'] or not results['documents'][0]:
            yield json.dumps({"type": "chunk", "data": "I couldn't find any relevant information in the uploaded documents."}) + "\n"
            return
            
        # Format sources and context
        context_texts = []
        sources = []
        
        for i, doc in enumerate(results['documents'][0]):
            metadata = results['metadatas'][0][i]
            context_texts.append(f"Content from page {metadata['page_number']}:\n{doc}")
            
            image_paths = []
            if metadata.get("image_paths"):
                image_paths = metadata["image_paths"].split(",")
                
            sources.append({
                "page_number": metadata['page_number'],
                "file_id": metadata['file_id'],
                "text_snippet": doc[:100] + "...",
                "images": image_paths
            })
            
        context = "\n\n---\n\n".join(context_texts)
        
        # Yield the sources first
        yield json.dumps({"type": "sources", "data": sources}) + "\n"
        
        # Prompt for local LLM
        prompt = f"""You are an intelligent PDF assistant. Answer the user's question based strictly on the extracted context below. 
If the context doesn't contain the answer, say you don't know based on the context. Always mention the page numbers listed in the context in your response.
CRITICAL RULE: If the original text in the context is formatted as a Markdown table (or visibly structured as a table), preserve that table format in your response. Do NOT create your own tables unless the data was explicitly a table in the source document.

Context:
{context}

Question: {question}

Answer:"""

        # Call Ollama API with streaming enabled
        try:
            with requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.ollama_model,
                    "prompt": prompt,
                    "stream": True
                },
                stream=True
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines(chunk_size=1):
                    if line:
                        parsed = json.loads(line)
                        chunk = parsed.get("response", "")
                        if chunk:
                            yield json.dumps({"type": "chunk", "data": chunk}) + "\n"
        except requests.exceptions.ConnectionError:
            yield json.dumps({"type": "chunk", "data": f"Error: Could not connect to Ollama at {self.ollama_url}. Please ensure Ollama is installed and running."}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "chunk", "data": f"Error communicating with local LLM: {e}. Make sure you ran 'ollama run {self.ollama_model}'."}) + "\n"

    def get_all_documents(self):
        """Returns a list of unique file_ids currently in the vector DB"""
        results = self.collection.get(include=["metadatas"])
        
        file_ids = set()
        if results and results.get("metadatas"):
            for meta in results["metadatas"]:
                if meta and "file_id" in meta:
                    file_ids.add(meta["file_id"])
                    
        return sorted(list(file_ids))

    def delete_document(self, file_id):
        """Deletes all chunks associated with a specific file_id"""
        self.collection.delete(
            where={"file_id": file_id}
        )
        return True
