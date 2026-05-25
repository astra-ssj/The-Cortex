# document_processor.py — Extract text (pypdf, python-docx), chunk with overlap, return List[DocumentChunk] with page metadata.

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

DocumentType = Literal["pdf", "docx", "txt"]

CHUNK_TOKEN_TARGET = 500
CHUNK_OVERLAP = 50
CHARS_PER_TOKEN = 4  # approximate

# Resource bounds — protect against decompression bombs / pathological documents.
# The upload size cap does not bound decompressed/extracted output, so cap it here.
MAX_PAGES = int(os.getenv("CORTEX_DOC_MAX_PAGES", "1000"))
MAX_PARAGRAPHS = int(os.getenv("CORTEX_DOC_MAX_PARAGRAPHS", "50000"))
MAX_EXTRACTED_CHARS = int(os.getenv("CORTEX_DOC_MAX_EXTRACTED_CHARS", str(5_000_000)))


class DocumentTooLargeError(ValueError):
    """Raised when an extracted document exceeds configured resource bounds."""


class DocumentChunk(BaseModel):
    """One chunk of document text with page and metadata."""

    content: str = Field(..., description="Extracted text segment")
    page_start: Optional[int] = Field(None, description="First page (1-based)")
    page_end: Optional[int] = Field(None, description="Last page (1-based)")
    chunk_index: int = 0
    document_type: str = ""


def _page_ranges_for_text(
    full_text: str,
    page_texts: list[tuple[int, str]],
) -> list[tuple[int, int, int]]:
    """Return (start_idx, end_idx, page_num) for each page segment in full_text (built as \\n\\n.join of page texts)."""
    ranges: list[tuple[int, int, int]] = []
    offset = 0
    sep = "\n\n"
    for page_num, page_text in page_texts:
        start = offset
        end = start + len(page_text)
        ranges.append((start, min(end, len(full_text)), page_num))
        offset = end + len(sep)
    return ranges


def _chunk_text(
    text: str,
    document_type: str,
    page_texts: Optional[list[tuple[int, str]]] = None,
) -> list[DocumentChunk]:
    """Split text into overlapping segments (~500 tokens, 50 overlap). Assign page_start/page_end when page_texts provided."""
    chunk_chars = CHUNK_TOKEN_TARGET * CHARS_PER_TOKEN
    overlap_chars = CHUNK_OVERLAP * CHARS_PER_TOKEN
    chunks: list[DocumentChunk] = []
    page_ranges = _page_ranges_for_text(text, page_texts) if page_texts else []
    start = 0
    idx = 0
    while start < len(text):
        end = min(start + chunk_chars, len(text))
        segment = text[start:end]
        if segment.strip():
            page_start_val: Optional[int] = None
            page_end_val: Optional[int] = None
            if page_ranges:
                for rs, re, pn in page_ranges:
                    if start < re and end > rs:
                        if page_start_val is None:
                            page_start_val = pn
                        page_end_val = pn
            chunks.append(
                DocumentChunk(
                    content=segment.strip(),
                    page_start=page_start_val,
                    page_end=page_end_val,
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
    if len(reader.pages) > MAX_PAGES:
        raise DocumentTooLargeError(f"PDF exceeds the {MAX_PAGES}-page limit")
    full_parts: list[str] = []
    page_texts: list[tuple[int, str]] = []
    total_chars = 0
    for i, page in enumerate(reader.pages, start=1):
        t = page.extract_text() or ""
        total_chars += len(t)
        if total_chars > MAX_EXTRACTED_CHARS:
            raise DocumentTooLargeError(f"PDF text exceeds the {MAX_EXTRACTED_CHARS}-character limit")
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
    total_chars = 0
    for i, para in enumerate(doc.paragraphs, start=1):
        if i > MAX_PARAGRAPHS:
            raise DocumentTooLargeError(f"DOCX exceeds the {MAX_PARAGRAPHS}-paragraph limit")
        t = para.text.strip()
        if t:
            total_chars += len(t)
            if total_chars > MAX_EXTRACTED_CHARS:
                raise DocumentTooLargeError(f"DOCX text exceeds the {MAX_EXTRACTED_CHARS}-character limit")
            parts.append(t)
            page_texts.append((i, t))
    return "\n\n".join(parts), page_texts


def extract_text_txt(file_path: str | Path) -> tuple[str, list[tuple[int, str]]]:
    """Read plain text file; page_texts use line index as pseudo-page."""
    path = Path(file_path)
    if path.stat().st_size > MAX_EXTRACTED_CHARS:
        raise DocumentTooLargeError(f"Text file exceeds the {MAX_EXTRACTED_CHARS}-character limit")
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    page_texts = [(i, line) for i, line in enumerate(lines, 1) if line.strip()]
    return text, page_texts


def process_document(file_path: str | Path, document_type: DocumentType) -> list[DocumentChunk]:
    """
    Accept file path + document type; extract text; chunk into overlapping segments.
    Return List[DocumentChunk] with page numbers and metadata.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(str(path))
    if document_type == "pdf":
        full_text, page_texts = extract_text_pdf(path)
    elif document_type == "docx":
        full_text, page_texts = extract_text_docx(path)
    elif document_type == "txt":
        full_text, page_texts = extract_text_txt(path)
    else:
        raise ValueError(f"Unsupported document_type: {document_type}")
    if not full_text.strip():
        return []
    return _chunk_text(full_text, document_type, page_texts)
