import json

import aiofiles


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
        raise ValueError(f"Unit not found: {unit_id}")

    async with aiofiles.open(f"{book_dir}/read_positions.json", "r") as f:
        read_positions = json.loads(await f.read())

    last_pct = read_positions.get(unit_id, 0)

    if scroll_pct <= last_pct:
        return False

    text = unit["text"]
    start = int(last_pct / 100 * len(text))
    end = int(scroll_pct / 100 * len(text))
    new_content = text[start:end]

    if not new_content.strip():
        return False

    async with aiofiles.open(f"{book_dir}/buffer.txt", "a") as f:
        await f.write(new_content + "\n\n")

    read_positions[unit_id] = scroll_pct
    async with aiofiles.open(f"{book_dir}/read_positions.json", "w") as f:
        await f.write(json.dumps(read_positions))

    return True