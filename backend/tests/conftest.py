import io
import json
import os
import textwrap
import zipfile
from pathlib import Path

import pymupdf
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db


# ---------------------------------------------------------------------------
# Book fixtures are generated in-process rather than checked in as binaries.
# tests/fixtures/ is gitignored, so a fresh clone has no test.epub / test.pdf;
# building them here with the parsing deps (ebooklib, pymupdf) keeps the whole
# suite runnable straight after `git clone`.
# ---------------------------------------------------------------------------


def _build_epub_bytes() -> bytes:
    """A minimal but valid EPUB 2.

    The content documents live under an ``OEBPS/`` subdirectory and the OPF
    sits beside them, so ``parse_epub`` has to join the OPF directory back on
    and emit container-root-relative unit ids (``OEBPS/chapter1.xhtml``), not
    bare filenames. That join is a real past defect, so the fixture covers it.
    """
    container_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<container version="1.0" '
        'xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
        '  <rootfiles>\n'
        '    <rootfile full-path="OEBPS/content.opf" '
        'media-type="application/oebps-package+xml"/>\n'
        '  </rootfiles>\n'
        '</container>\n'
    )
    opf = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" '
        'unique-identifier="bookid" version="2.0">\n'
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:opf="http://www.idpf.org/2007/opf">\n'
        '    <dc:identifier id="bookid">urn:uuid:synodos-test-epub-0001</dc:identifier>\n'
        '    <dc:title>The Synodos Test Reader</dc:title>\n'
        '    <dc:creator opf:role="aut">A. Test Author</dc:creator>\n'
        '    <dc:language>en</dc:language>\n'
        '  </metadata>\n'
        '  <manifest>\n'
        '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n'
        '    <item id="chapter1" href="chapter1.xhtml" '
        'media-type="application/xhtml+xml"/>\n'
        '    <item id="chapter2" href="chapter2.xhtml" '
        'media-type="application/xhtml+xml"/>\n'
        '  </manifest>\n'
        '  <spine toc="ncx">\n'
        '    <itemref idref="chapter1"/>\n'
        '    <itemref idref="chapter2"/>\n'
        '  </spine>\n'
        '</package>\n'
    )
    ncx = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'
        '  <head><meta name="dtb:uid" '
        'content="urn:uuid:synodos-test-epub-0001"/></head>\n'
        '  <docTitle><text>The Synodos Test Reader</text></docTitle>\n'
        '  <navMap>\n'
        '    <navPoint id="np1" playOrder="1"><navLabel><text>Chapter 1</text>'
        '</navLabel><content src="chapter1.xhtml"/></navPoint>\n'
        '    <navPoint id="np2" playOrder="2"><navLabel><text>Chapter 2</text>'
        '</navLabel><content src="chapter2.xhtml"/></navPoint>\n'
        '  </navMap>\n'
        '</ncx>\n'
    )

    def chapter(n: int, paragraphs: list[str]) -> str:
        body = "\n".join(f"<p>{textwrap.fill(p, 9999)}</p>" for p in paragraphs)
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<!DOCTYPE html>\n'
            '<html xmlns="http://www.w3.org/1999/xhtml">\n'
            f'<head><title>Chapter {n}</title></head>\n'
            f'<body>\n<h1>Chapter {n}</h1>\n{body}\n</body>\n</html>\n'
        )

    ch1 = chapter(1, [
        "The lamp in the window had not been lit for three winters, and still "
        "the villagers spoke of the house as though a light burned there.",
        "Mira walked the frost road at dawn, counting the fence posts the way "
        "her grandmother had taught her, one prayer to a post.",
        "By the time she reached the mill the sky had turned the colour of weak "
        "tea, and the water wheel stood locked in a collar of ice.",
    ])
    ch2 = chapter(2, [
        "The letter came folded twice, sealed with a smear of candle wax that "
        "someone had pressed a thumb into rather than a ring.",
        "It said only that the estate was settled, that nothing was owed, and "
        "that she should not trouble to write back.",
        "Mira read it on the mill steps and then again on the walk home, and by "
        "the second reading the cold had gone out of her hands.",
    ])

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # "mimetype" must be first and stored uncompressed.
        zf.writestr(
            zipfile.ZipInfo("mimetype"),
            "application/epub+zip",
            compress_type=zipfile.ZIP_STORED,
        )
        zf.writestr("META-INF/container.xml", container_xml)
        zf.writestr("OEBPS/content.opf", opf)
        zf.writestr("OEBPS/toc.ncx", ncx)
        zf.writestr("OEBPS/chapter1.xhtml", ch1)
        zf.writestr("OEBPS/chapter2.xhtml", ch2)
    return buf.getvalue()


def _build_pdf_bytes() -> bytes:
    """A 3-page text PDF — every page carries real prose so ``parse_pdf``
    keeps all three as ``page_1``..``page_3`` rather than skipping any."""
    paragraphs = [
        "This is page {n} of the Synodos test document. It carries enough prose "
        "that the parser keeps the page as a unit rather than skipping it as "
        "blank.",
        "A second paragraph follows on page {n}, so the extracted page text runs "
        "to a few hundred characters and a buffer slice has something real to "
        "cut.",
    ]
    doc = pymupdf.open()
    try:
        for n in range(1, 4):
            page = doc.new_page()
            y = 72
            for para in paragraphs:
                page.insert_textbox(
                    pymupdf.Rect(72, y, 500, y + 200),
                    para.format(n=n),
                    fontsize=12,
                )
                y += 160
        doc.set_metadata(
            {"title": "The Synodos Test Document", "author": "A. Test Author"}
        )
        return doc.tobytes()
    finally:
        doc.close()


@pytest.fixture(scope="session")
def epub_bytes():
    return _build_epub_bytes()


@pytest.fixture(scope="session")
def pdf_bytes():
    return _build_pdf_bytes()


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(tmp_path, db_session):
    storage_path = str(tmp_path / "storage")
    os.makedirs(storage_path, exist_ok=True)

    async def override_get_db():
        yield db_session

    # Patch STORAGE_PATH in all router modules before importing app
    import app.routers.books as books_mod
    import app.routers.progress as progress_mod
    import app.routers.chat as chat_mod

    orig_books = books_mod.STORAGE_PATH
    orig_progress = progress_mod.STORAGE_PATH
    orig_chat = chat_mod.STORAGE_PATH

    books_mod.STORAGE_PATH = storage_path
    progress_mod.STORAGE_PATH = storage_path
    chat_mod.STORAGE_PATH = storage_path

    from main import app

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    books_mod.STORAGE_PATH = orig_books
    progress_mod.STORAGE_PATH = orig_progress
    chat_mod.STORAGE_PATH = orig_chat


@pytest.fixture
def storage_path(tmp_path):
    sp = str(tmp_path / "storage")
    os.makedirs(sp, exist_ok=True)
    return sp


@pytest.fixture
def book_dir(storage_path):
    """Create a book directory with a synthetic manifest for buffer tests."""
    book_id = "test-book-001"
    bdir = Path(storage_path) / "books" / book_id
    bdir.mkdir(parents=True)

    manifest = [
        {
            "id": "ch1",
            "title": "Chapter 1",
            "text": "A" * 100,
            "char_count": 100,
        },
        {
            "id": "ch2",
            "title": "Chapter 2",
            "text": "B" * 200,
            "char_count": 200,
        },
    ]
    (bdir / "manifest.json").write_text(json.dumps(manifest))
    (bdir / "buffer.txt").write_text("")
    (bdir / "read_positions.json").write_text(json.dumps({}))

    return book_id, storage_path