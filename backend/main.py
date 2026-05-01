from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
import shutil
import os

# Suppress TensorFlow logging warnings
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

from groq import Groq

from typing import List

from services.pdf_parser import parse_pdf
from services.rag_engine import RAGEngine

from database import engine, get_db
from sqlalchemy.orm import Session
import models
from auth import get_password_hash, verify_password, create_access_token, get_current_user, require_admin, ACCESS_TOKEN_EXPIRE_MINUTES
from datetime import timedelta

models.Base.metadata.create_all(bind=engine)

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

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "client"
    admin_secret: str | None = None

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str

@app.post("/signup", response_model=Token)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    if user.role == "admin":
        expected_secret = os.environ.get("ADMIN_SECRET", "superadmin123")
        if user.admin_secret != expected_secret:
            raise HTTPException(status_code=403, detail="Invalid admin secret code")

    hashed_password = get_password_hash(user.password)
    new_user = models.User(username=user.username, hashed_password=hashed_password, role=user.role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": new_user.role}

@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...), current_user: models.User = Depends(require_admin), db: Session = Depends(get_db)):
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
        
        file_id = os.path.basename(file.filename).split('.')[0]
        file_size = os.path.getsize(file_path)
        
        existing_doc = db.query(models.Document).filter(models.Document.file_id == file_id).first()
        if not existing_doc:
            new_doc = models.Document(
                file_id=file_id, 
                filename=file.filename, 
                uploader_id=current_user.id, 
                size_bytes=file_size
            )
            db.add(new_doc)
            db.commit()
        
        results.append({
            "filename": file.filename,
            "chunks_processed": added
        })
        
    return {"message": "Upload successful", "processed": results, "total_chunks": total_chunks}

from fastapi.responses import StreamingResponse

@app.post("/query")
async def query_documents(request: QueryRequest, current_user: models.User = Depends(get_current_user)):
    return StreamingResponse(rag.query_stream(request.question), media_type="application/x-ndjson")

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...), current_user: models.User = Depends(get_current_user)):
    try:
        # Save temp audio file
        temp_file = f"temp_{file.filename}"
        with open(temp_file, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        with open(temp_file, "rb") as f:
            transcription = client.audio.transcriptions.create(
                file=(file.filename, f.read()),
                model="whisper-large-v3",
                language="en"
            )
            
        # Clean up temp file
        os.remove(temp_file)
        
        return {"text": transcription.text}
    except Exception as e:
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return {"error": str(e)}

@app.get("/documents")
async def get_documents(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    docs = db.query(models.Document).order_by(models.Document.created_at.desc()).all()
    
    uploader_ids = [d.uploader_id for d in docs]
    users = db.query(models.User).filter(models.User.id.in_(uploader_ids)).all()
    user_map = {u.id: u.username for u in users}
    
    result = []
    for d in docs:
        result.append({
            "file_id": d.file_id,
            "filename": d.filename,
            "size_bytes": d.size_bytes,
            "created_at": d.created_at,
            "uploader": user_map.get(d.uploader_id, "Unknown")
        })
    return {"documents": result}

@app.delete("/documents/{file_id}")
async def delete_document(file_id: str, current_user: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        rag.delete_document(file_id)
        
        doc = db.query(models.Document).filter(models.Document.file_id == file_id).first()
        if doc:
            db.delete(doc)
            db.commit()
        
        # Remove original PDF
        pdf_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
            
        # Remove extracted images from Cloudinary
        import cloudinary.api
        try:
            cloudinary.api.delete_resources_by_prefix(f"antirag_pdf_images/{file_id}")
            cloudinary.api.delete_folder(f"antirag_pdf_images/{file_id}")
        except Exception as e:
            print(f"Error deleting from Cloudinary: {e}")

        # Remove local extracted images if they exist
        if os.path.exists(STATIC_DIR):
            for filename in os.listdir(STATIC_DIR):
                if filename.startswith(f"{file_id}_p"):
                    os.remove(os.path.join(STATIC_DIR, filename))
                    
        return {"message": f"Document '{file_id}' deleted successfully"}
    except Exception as e:
        return {"message": f"Error deleting document: {e}"}

@app.get("/admin/analytics")
async def get_analytics(current_user: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    users_count = db.query(models.User).count()
    convs_count = db.query(models.Conversation).count()
    docs_count = db.query(models.Document).count()
    return {
        "total_users": users_count,
        "total_conversations": convs_count,
        "total_documents": docs_count
    }

class MessageCreate(BaseModel):
    role: str
    content: str
    sources: str | None = None

@app.post("/conversations")
def create_conversation(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_conv = models.Conversation(user_id=current_user.id)
    db.add(new_conv)
    db.commit()
    db.refresh(new_conv)
    return {"id": new_conv.id, "title": new_conv.title}

@app.get("/conversations")
def get_conversations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    convs = db.query(models.Conversation).filter(models.Conversation.user_id == current_user.id).order_by(models.Conversation.created_at.desc()).all()
    return [{"id": c.id, "title": c.title, "created_at": c.created_at} for c in convs]

@app.post("/conversations/{conv_id}/messages")
def add_message(conv_id: int, message: MessageCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conv_id, models.Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    new_msg = models.Message(conversation_id=conv_id, role=message.role, content=message.content, sources=message.sources)
    db.add(new_msg)
    db.commit()
    return {"status": "ok"}

@app.get("/conversations/{conv_id}/messages")
def get_messages(conv_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conv_id, models.Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = db.query(models.Message).filter(models.Message.conversation_id == conv_id).order_by(models.Message.created_at.asc()).all()
    return [{"role": m.role, "content": m.content, "sources": m.sources} for m in messages]
@app.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conv_id, models.Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Delete associated messages first
    db.query(models.Message).filter(models.Message.conversation_id == conv_id).delete()
    
    # Delete conversation
    db.delete(conv)
    db.commit()
    return {"status": "success"}
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
