@echo off
echo Starting Multi-Modal PDF RAG Environment...
echo ==============================================
echo [INFO] Starting Backend Server on port 8000...
start cmd /k "cd backend && .\venv\Scripts\activate && uvicorn main:app --reload --port 8000"

echo [INFO] Starting Frontend Dev Server...
start cmd /k "cd frontend && npm run dev"

echo ==============================================
echo [WARNING] IMPORTANT: Please make sure you have Ollama running in another terminal.
echo Example command: ollama run llama3
echo ==============================================
echo The frontend will be available at http://localhost:5173
echo The backend API will be available at http://localhost:8000
