import pytest

from app.services.parser import parse_book


class TestEpubParsing:
    def test_epub_returns_nonempty_manifest(self, epub_bytes):
        manifest, title, author, fmt = parse_book(epub_bytes, "test.epub")
        assert len(manifest) > 0
        assert fmt == "epub"

    def test_epub_extracts_title_and_author(self, epub_bytes):
        _, title, author, _ = parse_book(epub_bytes, "test.epub")
        assert isinstance(title, str) and len(title) > 0
        assert isinstance(author, str) and len(author) > 0

    def test_epub_units_have_required_fields(self, epub_bytes):
        manifest, *_ = parse_book(epub_bytes, "test.epub")
        for unit in manifest:
            assert "id" in unit
            assert "title" in unit
            assert "text" in unit
            assert "char_count" in unit
            assert unit["char_count"] == len(unit["text"])

    def test_epub_total_char_count_positive(self, epub_bytes):
        manifest, *_ = parse_book(epub_bytes, "test.epub")
        total = sum(u["char_count"] for u in manifest)
        assert total > 0


class TestPdfParsing:
    def test_pdf_returns_nonempty_manifest(self, pdf_bytes):
        manifest, title, author, fmt = parse_book(pdf_bytes, "test.pdf")
        assert len(manifest) > 0
        assert fmt == "pdf"

    def test_pdf_sequential_unit_ids(self, pdf_bytes):
        manifest, *_ = parse_book(pdf_bytes, "test.pdf")
        for unit in manifest:
            assert unit["id"].startswith("page_")
        # IDs should be sequential integers (though some pages may be skipped if blank)
        page_nums = [int(u["id"].split("_")[1]) for u in manifest]
        assert page_nums == sorted(page_nums)

    def test_pdf_units_have_required_fields(self, pdf_bytes):
        manifest, *_ = parse_book(pdf_bytes, "test.pdf")
        for unit in manifest:
            assert "id" in unit
            assert "title" in unit
            assert "text" in unit
            assert "char_count" in unit
            assert unit["char_count"] == len(unit["text"])


class TestUnsupportedFormat:
    def test_unsupported_format_raises(self):
        with pytest.raises(ValueError, match="Unsupported format"):
            parse_book(b"data", "book.txt")