from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import shutil
import os

# Suppress TensorFlow logging warnings
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

from typing import List

from services.pdf_parser import parse_pdf
from services.rag_engine import RAGEngine

app = FastAPI(title="Multi-Modal PDF RAG API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow frontend to connect
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create necessary directories
UPLOAD_DIR = "./uploads"
STATIC_DIR = "./static/media"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# Mount static files for images
app.mount("/static/media", StaticFiles(directory=STATIC_DIR), name="static")

# Initialize RAG Engine
rag = RAGEngine()

class QueryRequest(BaseModel):
    question: str

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    total_chunks = 0
    results = []
    
    for file in files:
        if not file.filename.endswith(".pdf"):
            continue
            
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Parse PDF and extract images
        chunks = parse_pdf(file_path, STATIC_DIR)
        
        # Add chunks to Vector DB
        added = rag.add_chunks(chunks)
        total_chunks += added
        
        results.append({
            "filename": file.filename,
            "chunks_processed": added
        })
        
    return {"message": "Upload successful", "processed": results, "total_chunks": total_chunks}

from fastapi.responses import StreamingResponse

@app.post("/query")
async def query_documents(request: QueryRequest):
    return StreamingResponse(rag.query_stream(request.question), media_type="application/x-ndjson")

@app.get("/documents")
async def get_documents():
    docs = rag.get_all_documents()
    return {"documents": docs}

@app.delete("/documents/{file_id}")
async def delete_document(file_id: str):
    try:
        rag.delete_document(file_id)
        
        # Remove original PDF
        pdf_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
            
        # Remove extracted images
        if os.path.exists(STATIC_DIR):
            for filename in os.listdir(STATIC_DIR):
                if filename.startswith(f"{file_id}_p"):
                    os.remove(os.path.join(STATIC_DIR, filename))
                    
        return {"message": f"Document '{file_id}' deleted successfully"}
    except Exception as e:
        return {"message": f"Error deleting document: {e}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
