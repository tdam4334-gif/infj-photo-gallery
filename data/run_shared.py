"""保持共享服务与公网隧道在线。

用法：
  python data/run_shared.py
会启动/复用 8765 的 server.py，并用 localhost.run 暴露公网 HTTPS。
把打印出来的 https://xxxx.lhr.life 发给别人即可（进程需保持运行）。
"""
from __future__ import annotations

import re
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORT = 8765
LOG = ROOT / "data" / "shared-tunnel.log"


def log(msg: str) -> None:
    print(msg, flush=True)


def port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def ensure_server() -> None:
    if port_open(PORT):
        log(f"[server] already on :{PORT}")
        return
    log(f"[server] starting server.py on :{PORT}")
    subprocess.Popen(
        [sys.executable, str(ROOT / "server.py")],
        cwd=str(ROOT),
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    for _ in range(20):
        time.sleep(0.3)
        if port_open(PORT):
            log("[server] ready")
            return
    raise RuntimeError("server failed to start")


def ensure_tunnel() -> str:
    LOG.write_text("", encoding="utf-8")
    log("[tunnel] connecting localhost.run ...")
    proc = subprocess.Popen(
        [
            "ssh",
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "UserKnownHostsFile=/dev/null",
            "-o",
            "ServerAliveInterval=30",
            "-R",
            f"80:127.0.0.1:{PORT}",
            "nokey@localhost.run",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(ROOT),
    )

    url = None
    deadline = time.time() + 45
    lines = []
    assert proc.stdout is not None
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                break
            continue
        lines.append(line)
        m = re.search(r"https://[a-z0-9.-]+\.lhr\.life", line)
        if m:
            url = m.group(0)
            break

    if not url:
        LOG.write_text("".join(lines), encoding="utf-8")
        raise RuntimeError(f"tunnel url not found, see {LOG}")

    (ROOT / "data" / "PUBLIC_URL.txt").write_text(url + "\n", encoding="utf-8")
    LOG.write_text("".join(lines) + f"\nPUBLIC_URL={url}\n", encoding="utf-8")

    log("\n========================================")
    log("共享相册公网地址（发给朋友）：")
    log(url)
    log("========================================\n")
    log("提示：保持本进程运行，关掉后链接会失效。")
    return url


def main() -> None:
    ensure_server()
    ensure_tunnel()
    log("runner idle; tunnel kept alive.")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        log("stopped")


if __name__ == "__main__":
    main()
