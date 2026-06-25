from __future__ import annotations

import csv
import io
import zipfile
from collections import defaultdict

from .schemas import ObservationRow


def rows_to_csv_bytes(rows: list[ObservationRow]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["frame_index", "track_id", "domain", "landmark_index", "x", "y", "z", "visibility"])
    for row in rows:
        writer.writerow([row.frame_index, row.track_id, row.domain, row.landmark_index, row.x, row.y, row.z, row.visibility])
    return buffer.getvalue().encode("utf-8")


def rows_to_zip_bytes(rows: list[ObservationRow]) -> bytes:
    grouped: dict[tuple[str, str], list[ObservationRow]] = defaultdict(list)
    for row in rows:
        grouped[(row.track_id, row.domain)].append(row)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for (track_id, domain), group_rows in grouped.items():
            group_rows = sorted(group_rows, key=lambda r: r.frame_index)
            name = f"track_{track_id}/{domain}.csv"
            zf.writestr(name, rows_to_csv_bytes(group_rows))

        zf.writestr("all.csv", rows_to_csv_bytes(sorted(rows, key=lambda r: (r.track_id, r.domain, r.frame_index))))

    return zip_buffer.getvalue()
