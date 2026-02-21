# services/ingestion/document_processor.py — Extract text, chunk into overlapping segments.

from __future__ import annotations

from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

# Lazy imports for optional deps (pypdf, python-docx) so tests can mock.
DocumentType = Literal["pdf", "docx", "txt"]

CHUNK_TOKEN_TARGET = 500
CHUNK_OVERLAP = 50
CHARS_PER_TOKEN = 4  # approximate


class DocumentChunk(BaseModel):
    """One chunk of document text with page and metadata."""

    content: str = Field(..., description="Extracted text segment")
    page_start: Optional[int] = Field(None, description="First page (1-based)")
    page_end: Optional[int] = Field(None, description="Last page (1-based)")
    chunk_index: int = 0
    document_type: str = ""


def _chunk_text(text: str, document_type: str) -> list[DocumentChunk]:
    """Split text into overlapping segments (~500 tokens, 50 overlap)."""
    chunk_chars = CHUNK_TOKEN_TARGET * CHARS_PER_TOKEN
    overlap_chars = CHUNK_OVERLAP * CHARS_PER_TOKEN
    chunks: list[DocumentChunk] = []
    start = 0
    idx = 0
    while start < len(text):
        end = min(start + chunk_chars, len(text))
        segment = text[start:end]
        if segment.strip():
            chunks.append(
                DocumentChunk(
                    content=segment.strip(),
                    page_start=None,
                    page_end=None,
                    chunk_index=idx,
                    document_type=document_type,
                )
            )
            idx += 1
        start = end - overlap_chars if end < len(text) else len(text)
    return chunks


def extract_text_pdf(file_path: str | Path) -> tuple[str, list[tuple[int, str]]]:
    """Extract text from PDF; return (full_text, [(page_num, page_text), ...])."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ImportError("pypdf is required for PDF extraction. pip install pypdf")
    reader = PdfReader(str(file_path))
    full_parts: list[str] = []
    page_texts: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        t = page.extract_text() or ""
        page_texts.append((i, t))
        full_parts.append(t)
    return "\n\n".join(full_parts), page_texts


def extract_text_docx(file_path: str | Path) -> tuple[str, list[tuple[int, str]]]:
    """Extract text from DOCX; return (full_text, [(paragraph_index, para_text), ...])."""
    try:
        from docx import Document
    except ImportError:
        raise ImportError("python-docx is required for DOCX extraction. pip install python-docx")
    doc = Document(str(file_path))
    parts: list[str] = []
    page_texts: list[tuple[int, str]] = []
    for i, para in enumerate(doc.paragraphs, start=1):
        t = para.text.strip()
        if t:
            parts.append(t)
            page_texts.append((i, t))
    return "\n\n".join(parts), page_texts


def extract_text_txt(file_path: str | Path) -> tuple[str, list[tuple[int, str]]]:
    """Read plain text file."""
    path = Path(file_path)
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    page_texts = [(i, line) for i, line in enumerate(lines, 1) if line.strip()]
    return text, page_texts


def process_document(file_path: str | Path, document_type: DocumentType) -> list[DocumentChunk]:
    """
    Accept file path + document type; extract text; chunk into overlapping segments.
    Return List[DocumentChunk] with metadata.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(str(path))
    if document_type == "pdf":
        full_text, _ = extract_text_pdf(path)
    elif document_type == "docx":
        full_text, _ = extract_text_docx(path)
    elif document_type == "txt":
        full_text, _ = extract_text_txt(path)
    else:
        raise ValueError(f"Unsupported document_type: {document_type}")
    if not full_text.strip():
        return []
    return _chunk_text(full_text, document_type)
