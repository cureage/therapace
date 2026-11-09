"""Serve stored files with HTTP Range support so mobile video players can stream them.

iOS AVPlayer only plays HTTP video from servers that answer byte-range requests (206 Partial
Content); Android ExoPlayer uses them to seek and to resume buffering.
"""
import re

from django.http import FileResponse, HttpResponse, StreamingHttpResponse

_BYTE_RANGE = re.compile(r"bytes=(\d*)-(\d*)")
_CHUNK_SIZE = 64 * 1024


def parse_byte_range(header, size):
    """Parse a Range header for a file of `size` bytes.

    Returns (start, end) for one satisfiable range, None to send the whole file, or False when the
    range cannot be satisfied (416). Malformed and multi-range headers are ignored, as RFC 9110
    allows.
    """
    match = _BYTE_RANGE.fullmatch(header.replace(" ", ""))
    if match is None:
        return None
    first, last = match.groups()
    if first:
        start = int(first)
        if last and int(last) < start:
            return None
        end = int(last) if last else size - 1
    elif last:
        suffix_length = int(last)
        if suffix_length == 0:
            return False
        start, end = max(size - suffix_length, 0), size - 1
    else:
        return None
    if start >= size:
        return False
    return start, min(end, size - 1)


def ranged_file_response(request, field_file, content_type):
    """Stream a FieldFile, answering Range requests with 206 Partial Content."""
    storage, name = field_file.storage, field_file.name
    size = storage.size(name)
    byte_range = parse_byte_range(request.headers.get("Range", ""), size)
    if byte_range is False:
        response = HttpResponse(status=416)
        response["Content-Range"] = f"bytes */{size}"
    elif byte_range is None:
        response = FileResponse(storage.open(name, "rb"), content_type=content_type)
    else:
        start, end = byte_range
        length = end - start + 1
        response = StreamingHttpResponse(
            _read_range(storage, name, start, length), status=206, content_type=content_type
        )
        response["Content-Length"] = str(length)
        response["Content-Range"] = f"bytes {start}-{end}/{size}"
    response["Accept-Ranges"] = "bytes"
    return response


def _read_range(storage, name, start, length):
    with storage.open(name, "rb") as handle:
        handle.seek(start)
        while length > 0:
            chunk = handle.read(min(_CHUNK_SIZE, length))
            if not chunk:
                break
            length -= len(chunk)
            yield chunk
