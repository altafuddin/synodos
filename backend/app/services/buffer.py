import json

import aiofiles
import structlog

log = structlog.get_logger("synodos.buffer")


async def append_to_buffer(
    book_id: str, unit_id: str, scroll_pct: int, storage_path: str
) -> bool:
    book_dir = f"{storage_path}/books/{book_id}"

    async with aiofiles.open(f"{book_dir}/manifest.json", "r") as f:
        manifest = json.loads(await f.read())

    unit = None
    for item in manifest:
        if item["id"] == unit_id:
            unit = item
            break
    if unit is None:
        log.warning("buffer_unit_not_found", book_id=book_id, unit_id=unit_id)
        raise ValueError(f"Unit not found: {unit_id}")

    async with aiofiles.open(f"{book_dir}/read_positions.json", "r") as f:
        read_positions = json.loads(await f.read())

    last_pct = read_positions.get(unit_id, 0)

    if scroll_pct <= last_pct:
        log.debug(
            "buffer_skip_nonadvancing",
            book_id=book_id,
            unit_id=unit_id,
            scroll_pct=scroll_pct,
            last_pct=last_pct,
        )
        return False

    text = unit["text"]
    start = int(last_pct / 100 * len(text))
    end = int(scroll_pct / 100 * len(text))
    new_content = text[start:end]

    if not new_content.strip():
        log.debug(
            "buffer_skip_empty",
            book_id=book_id,
            unit_id=unit_id,
            scroll_pct=scroll_pct,
        )
        return False

    async with aiofiles.open(f"{book_dir}/buffer.txt", "a") as f:
        await f.write(new_content + "\n\n")

    read_positions[unit_id] = scroll_pct
    async with aiofiles.open(f"{book_dir}/read_positions.json", "w") as f:
        await f.write(json.dumps(read_positions))

    log.info(
        "buffer_appended",
        book_id=book_id,
        unit_id=unit_id,
        scroll_pct=scroll_pct,
        added_chars=len(new_content),
    )

    return True