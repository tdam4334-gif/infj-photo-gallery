"""Detached launcher for shared server + public tunnel."""
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(r"E:\mimo\infj-gallery")
log = ROOT / "data" / "shared-runner.log"
url_file = ROOT / "data" / "PUBLIC_URL.txt"
if url_file.exists():
    url_file.unlink()
log.write_text("", encoding="utf-8")

subprocess.run(["taskkill", "/F", "/IM", "ssh.exe"], capture_output=True)
time.sleep(0.5)

cmd = f'cmd /c "set PYTHONUNBUFFERED=1 && "{sys.executable}" "{ROOT / "data" / "run_shared.py"}" > "{log}" 2>&1"'
proc = subprocess.Popen(
    cmd,
    cwd=str(ROOT),
    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
    close_fds=True,
)
print("runner pid", proc.pid, flush=True)
for i in range(35):
    time.sleep(1)
    if url_file.exists():
        print("PUBLIC_URL:", url_file.read_text(encoding="utf-8").strip(), flush=True)
        break
    if i in (8, 20, 32):
        print("waiting", i, "logbytes", log.stat().st_size if log.exists() else -1, flush=True)
else:
    print("no url file", flush=True)
    print(log.read_text(encoding="utf-8", errors="replace")[:3000] if log.exists() else "missing", flush=True)
