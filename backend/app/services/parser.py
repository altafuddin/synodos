import os
import tempfile
from pathlib import Path

import ebooklib
from bs4 import BeautifulSoup
from ebooklib import epub
import fitz


def parse_epub(file_bytes: bytes) -> list[dict]:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".epub")
    try:
        tmp.write(file_bytes)
        tmp.close()
        book = epub.read_epub(tmp.name)
    finally:
        os.unlink(tmp.name)

    units = []
    for item_id, _ in book.spine:
        item = book.get_item_with_id(item_id)
        if item is None:
            continue

        content = item.get_content()
        soup = BeautifulSoup(content, "html.parser")
        text = soup.get_text(separator=" ", strip=True)
        if not text:
            continue

        file_name = Path(item.get_name()).stem
        title = getattr(item, "title", None) or file_name

        units.append({
            "id": file_name,
            "title": title,
            "text": text,
            "char_count": len(text),
        })

    return units


def parse_pdf(file_bytes: bytes) -> list[dict]:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    try:
        units = []
        for i in range(len(doc)):
            page = doc.load_page(i)
            text = page.get_text()
            if not text.strip():
                continue

            units.append({
                "id": f"page_{i + 1}",
                "title": f"Page {i + 1}",
                "text": text,
                "char_count": len(text),
            })

        if not units:
            raise ValueError("Scanned PDFs are not supported")

        return units
    finally:
        doc.close()


def parse_book(file_bytes: bytes, filename: str) -> tuple[list[dict], str, str, str]:
    suffix = Path(filename).suffix.lower()
    stem = Path(filename).stem

    if suffix == ".epub":
        manifest = parse_epub(file_bytes)

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".epub")
        try:
            tmp.write(file_bytes)
            tmp.close()
            book = epub.read_epub(tmp.name)
        finally:
            os.unlink(tmp.name)

        titles = book.get_metadata("DC", "title")
        title = titles[0][0] if titles else stem

        creators = book.get_metadata("DC", "creator")
        author = creators[0][0] if creators else "Unknown"

        return manifest, title, author, "epub"

    elif suffix == ".pdf":
        manifest = parse_pdf(file_bytes)

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        try:
            meta_title = doc.metadata.get("title")
            title = meta_title if meta_title else stem

            meta_author = doc.metadata.get("author")
            author = meta_author if meta_author else "Unknown"
        finally:
            doc.close()

        return manifest, title, author, "pdf"

    else:
        raise ValueError(f"Unsupported format: {suffix}")