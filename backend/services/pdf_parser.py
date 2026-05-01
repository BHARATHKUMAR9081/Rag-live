import fitz # PyMuPDF
import os
import cloudinary.uploader

def chunk_text(text, chunk_size=300, overlap=50):
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
    return chunks

def parse_pdf(pdf_path: str, static_dir: str):
    """
    Parses a PDF, extracting text and associated images per page.
    Returns a list of dicts representing chunks of text + metadata.
    """
    doc = fitz.open(pdf_path)
    file_id = os.path.basename(pdf_path).split('.')[0]
    
    all_chunks = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # Extract text
        text = page.get_text("text").strip()
        if len(text) < 10:
            continue
            
        # Extract images
        image_list = page.get_images(full=True)
        saved_images = []
        
        for img_index, img in enumerate(image_list, start=1):
            xref = img[0]
            try:
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                
                # Save image
                image_filename = f"{file_id}_p{page_num + 1}_i{img_index}.{image_ext}"
                image_path = os.path.join(static_dir, image_filename)
                
                with open(image_path, "wb") as f:
                    f.write(image_bytes)
                    
                # Upload to Cloudinary
                upload_result = cloudinary.uploader.upload(image_path, folder=f"antirag_pdf_images/{file_id}")
                saved_images.append(upload_result["secure_url"])
                
                # Clean up local file
                if os.path.exists(image_path):
                    os.remove(image_path)
            except Exception as e:
                print(f"Error extracting image {img_index} on page {page_num+1}: {e}")
                
        # Split text into chunks
        text_chunks = chunk_text(text)
        
        for chunk in text_chunks:
            chunk_data = {
                "text": chunk,
                "metadata": {
                    "file_id": file_id,
                    "page_number": page_num + 1,
                    "image_paths": ",".join(saved_images) if saved_images else ""
                }
            }
            all_chunks.append(chunk_data)
            
    return all_chunks
