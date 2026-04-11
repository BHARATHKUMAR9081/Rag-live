# Project Report: Multi-Modal Local PDF RAG Explorer

## 1. Project Overview
The **Multi-Modal Local PDF RAG Explorer** is a fully private, offline, and locally hosted Retrieval-Augmented Generation (RAG) system. It enables users to converse seamlessly with their PDF documents utilizing a sophisticated Large Language Model (**LLaMA-3 via Ollama**). What makes this project unique is its fully **multi-modal capabilities**—the system does not just extract and retrieve text, but actively extracts, indexes, and cites **images and tables** directly from the uploaded PDFs.

All generated responses stream in real-time within a beautiful React-based frontend chat interface, completely bypassing the need for paid API services like OpenAI, preserving 100% data privacy.

---

## 2. Core Features
- **Fully Local & Private Execution:** No data leaves the machine. Embeddings and LLM inferences are handled exclusively through local hardware processing.
- **Multi-Modal Document Parsing:** The Python backend parses uploaded PDFs, chunking textual data while simultaneously extracting and indexing layout-rich objects like tables and figures. 
- **Exact Highlighting & Source Citations:** While answering questions, the LLM provides source citations including exact page numbers. Relevant text snippets and associated extracted images are displayed alongside the chat bubbles.
- **Real-Time Streaming Interface:** Inspired by premium LLM chats, Server-Sent Events (SSE) power word-by-word streaming generation directly into the browser, complete with a visual typing cursor.
- **Markdown & Tabular Data Native Support:** If context is inherently tabulated inside the PDF, the engine forces the LLM to output a clean Markdown table, matching the source material perfectly.
- **Intelligent Resource Management:** Ability to upload new multi-modal PDFs or delete existing contexts out of the database seamlessly.

---

## 3. Technology Architecture & Stack

### Frontend (User Interface)
The frontend is built for simplicity and rich visuals, heavily prioritizing user experience during streaming generation.
* **React + Vite:** For an extremely fast, modular single-page application experience.
* **Vanilla CSS:** Custom-crafted glassmorphism styling, clean modern color palettes, and responsive layouts.
* **react-markdown & remarkGfm:** Ensures all AI output is rendered richly, parsing lists, code snippets, and Markdown tables flawlessly.
* **Lucide-React:** Provides sleek, modern SVG iconography for avatars, buttons, and system statuses.

### Backend (Logic & Parsing)
The backend orchestrates chunking, embedding generation, vector DB transactions, and streaming communication.
* **FastAPI:** A high-performance async Python framework providing RESTful API endpoints and real-time Generator streams (via `StreamingResponse` NDJSON).
* **PyMuPDF (fitz) / PDF Parsers:** Handles the complex task of tearing apart the PDF structure and associating text chunks with visual objects (images).
* **Sentence-Transformers (`all-MiniLM-L6-v2`):** Used to compute the dense mathematical vector representations of document chunks.

### Database & Inference Engines
* **ChromaDB:** A persistent, locally hosted vector database mapping the high-dimensional embeddings and metadata. 
* **Ollama (LLaMA-3):** Operates as the brain of the application, utilizing generative instructions to parse the retrieved ChromaDB context into human-like chat responses.

---

## 4. Key Engineering Implementations

Through the development process, several significant engineering hurdles were overcome to construct a highly polished user experience:

1. **Anti-Buffering Stream Pipeline:**
   Standard HTTP logic naturally buffers small data batches before sending. When creating an LLM stream, this leads to a "chunky" delayed effect where lines appear blocks at a time. The Python backend logic was optimized using explicit unbuffered `iter_lines(chunk_size=1)` iterations to pipe bytes instantly. This ensures an impeccably smooth real-time generation effect in the frontend.

2. **Scroll Lock Analytics & Prevention:**
   During long generation streams (especially with huge source cards embedded in the chat), browsers often struggle predicting scroll heights. The frontend relies on carefully timed localized container scrolls (`scrollTop = scrollHeight`) combined with DOM isolation (hiding context-sources until LLM generation fully completes). This creates a cinematic typing flow without any jumpy browser windows.

3. **Strict Context Adherence (Hallucination Prevention):**
   A major focus was achieving accuracy. The extraction engine was heavily modified via strict rule prompting to force the LLM to **only** use extracted materials. Crucially, the engine relies on explicit prompts regulating table formatting so the LLM respects the structure of visually formatted PDF data without fabricating tables needlessly.

---

## 5. Setup & Initialization Sequence
The application runs out of the box through a localized batch interface script that seamlessly bootstraps the entire development environment:
1. Initialize the Chroma database storage daemon and FastAPI Python process (`port 8000`).
2. Boot up the Vite preview engine for the React interface (`port 5173`).
3. Handshake and await the local terminal connection to the `ollama run llama3` background worker.
