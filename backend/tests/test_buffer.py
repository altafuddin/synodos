import json
from pathlib import Path

import pytest
import pytest_asyncio

from app.services.buffer import append_to_buffer


@pytest.mark.asyncio
class TestAppendToBuffer:
    async def test_first_scroll_appends_content(self, book_dir):
        book_id, storage_path = book_dir
        result = await append_to_buffer(book_id, "ch1", 50, storage_path)
        assert result is True

        buf = (Path(storage_path) / "books" / book_id / "buffer.txt").read_text()
        assert len(buf) > 0

    async def test_scroll_back_returns_false(self, book_dir):
        book_id, storage_path = book_dir
        await append_to_buffer(book_id, "ch1", 50, storage_path)

        result = await append_to_buffer(book_id, "ch1", 25, storage_path)
        assert result is False

    async def test_duplicate_scroll_returns_false(self, book_dir):
        book_id, storage_path = book_dir
        await append_to_buffer(book_id, "ch1", 50, storage_path)

        result = await append_to_buffer(book_id, "ch1", 50, storage_path)
        assert result is False

    async def test_forward_scroll_appends_only_new_portion(self, book_dir):
        book_id, storage_path = book_dir
        buf_path = Path(storage_path) / "books" / book_id / "buffer.txt"

        await append_to_buffer(book_id, "ch1", 50, storage_path)
        size_after_first = len(buf_path.read_text())

        await append_to_buffer(book_id, "ch1", 100, storage_path)
        size_after_second = len(buf_path.read_text())

        assert size_after_second > size_after_first

    async def test_read_positions_updated(self, book_dir):
        book_id, storage_path = book_dir
        pos_path = Path(storage_path) / "books" / book_id / "read_positions.json"

        await append_to_buffer(book_id, "ch1", 50, storage_path)
        positions = json.loads(pos_path.read_text())
        assert positions["ch1"] == 50

        await append_to_buffer(book_id, "ch1", 75, storage_path)
        positions = json.loads(pos_path.read_text())
        assert positions["ch1"] == 75

    async def test_invalid_unit_raises(self, book_dir):
        book_id, storage_path = book_dir
        with pytest.raises(ValueError, match="Unit not found"):
            await append_to_buffer(book_id, "nonexistent", 50, storage_path)