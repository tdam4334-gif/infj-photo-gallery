#!/usr/bin/env python3
"""心隅 · 共享照片服务：静态站 + 上传 API。

本地跑：  python server.py
公网共享：配合 cloudflared / 内网穿透，不要把写接口裸奔在无鉴权公网而不加限制。
"""

from __future__ import annotations

import json
import re
import threading
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
INDEX_PATH = DATA_DIR / "photos.json"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
Mood = {"quiet", "light", "rain", "night", "nature", "alone", "soft"}

_lock = threading.Lock()


def ensure_storage() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    if not INDEX_PATH.exists():
        INDEX_PATH.write_text("[]", encoding="utf-8")


def load_index() -> list:
    ensure_storage()
    try:
        data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def save_index(items: list) -> None:
    ensure_storage()
    tmp = INDEX_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(INDEX_PATH)


def sanitize_text(value: str | None, limit: int = 80) -> str:
    if not value:
        return ""
    text = re.sub(r"[\r\n\t]+", " ", str(value)).strip()
    return text[:limit]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{time.strftime('%H:%M:%S')}] {self.address_string()} {fmt % args}")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status: int, payload: dict | list) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            self._json(200, {"ok": True, "count": len(load_index())})
            return
        if path == "/api/photos":
            self._json(200, {"photos": load_index()})
            return
        if path.startswith("/data/uploads/"):
            # serve uploaded files only from upload dir
            rel = path[len("/data/uploads/") :]
            if "/" in rel or "\\" in rel or ".." in rel:
                self._json(400, {"error": "非法路径"})
                return
            file_path = UPLOAD_DIR / rel
            if not file_path.is_file():
                self._json(404, {"error": "文件不存在"})
                return
            self.path = f"/data/uploads/{rel}"
            return super().do_GET()
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/api/upload":
            self._json(404, {"error": "接口不存在"})
            return

        ctype = self.headers.get("Content-Type", "")
        if not ctype.startswith("multipart/form-data"):
            self._json(400, {"error": "需要 multipart/form-data"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0:
            self._json(400, {"error": "空请求"})
            return
        if length > MAX_UPLOAD_BYTES + 4096:
            self._json(413, {"error": "文件过大，请换一张不超过 8MB 的图"})
            return

        raw = self.rfile.read(length)
        boundary = ""
        for part in ctype.split(";"):
            part = part.strip()
            if part.startswith("boundary="):
                boundary = part.split("=", 1)[1].strip().strip('"')
        if not boundary:
            self._json(400, {"error": "缺少 multipart boundary"})
            return

        fields, files = parse_multipart(raw, boundary)
        upload = files.get("photo")
        if not upload:
            self._json(400, {"error": "没有收到照片"})
            return

        filename, content_type, data = upload
        if content_type not in ALLOWED_TYPES:
            self._json(400, {"error": "只支持 JPG、PNG、WebP"})
            return
        if len(data) > MAX_UPLOAD_BYTES:
            self._json(413, {"error": "文件超过 8MB"})
            return
        if len(data) < 64:
            self._json(400, {"error": "图片内容无效"})
            return

        ext = ALLOWED_TYPES[content_type]
        # light magic-byte check
        if ext == ".jpg" and not data.startswith(b"\xff\xd8"):
            self._json(400, {"error": "图片内容与格式不符"})
            return
        if ext == ".png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
            self._json(400, {"error": "图片内容与格式不符"})
            return
        if ext == ".webp" and not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
            self._json(400, {"error": "图片内容与格式不符"})
            return

        caption = sanitize_text(fields.get("caption"), 80) or "未留下文字，但照片本身已经说了不少。"
        author = sanitize_text(fields.get("author") or fields.get("name"), 20) or "匿名 INFJ"
        mood = sanitize_text(fields.get("mood"), 12) or "quiet"
        if mood not in Mood:
            mood = "quiet"

        file_id = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
        save_name = f"{file_id}{ext}"
        save_path = UPLOAD_DIR / save_name
        ensure_storage()
        save_path.write_bytes(data)

        record = {
            "id": file_id,
            "src": f"/data/uploads/{save_name}",
            "caption": caption,
            "mood": mood,
            "author": author,
            "createdAt": int(time.time() * 1000),
            "shared": True,
        }

        with _lock:
            items = load_index()
            items.insert(0, record)
            # keep the newest 500 shared photos to bound disk use
            items = items[:500]
            save_index(items)

        self._json(200, {"ok": True, "photo": record})

    def end_headers(self) -> None:
        if urlparse(self.path).path.startswith("/api/"):
            self._cors()
        super().end_headers()


def parse_multipart(raw: bytes, boundary: str):
    """Minimal multipart parser (enough for small photo uploads)."""
    fields: dict[str, str] = {}
    files: dict[str, tuple[str, str, bytes]] = {}
    delim = b"--" + boundary.encode("utf-8")
    parts = raw.split(delim)
    for part in parts:
        if not part or part in (b"--\r\n", b"--", b"--\r\n"):
            continue
        if part.startswith(b"--"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        header_blob, _, body = part.partition(b"\r\n\r\n")
        headers = {}
        for line in header_blob.split(b"\r\n"):
            if b":" not in line:
                continue
            k, v = line.split(b":", 1)
            headers[k.decode("utf-8", "ignore").lower().strip()] = v.decode("utf-8", "ignore").strip()
        disposition = headers.get("content-disposition", "")
        name_m = re.search(r'name="([^"]+)"', disposition)
        if not name_m:
            continue
        name = name_m.group(1)
        filename_m = re.search(r'filename="([^"]*)"', disposition)
        if filename_m is not None:
            filename = filename_m.group(1) or "upload.bin"
            ctype = headers.get("content-type", "application/octet-stream")
            files[name] = (filename, ctype, body)
        else:
            fields[name] = body.decode("utf-8", "ignore")
    return fields, files


def main() -> None:
    ensure_storage()
    host = "127.0.0.1"
    port = 8765
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"心隅共享服务已启动: http://{host}:{port}")
    print(f"共享相册数据目录: {UPLOAD_DIR}")
    print("API: GET /api/photos  POST /api/upload")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
