#!/usr/bin/env bash
# 心隅国内版一键部署（Ubuntu/Debian 轻量服务器）
# 用法: sudo bash install.sh
set -euo pipefail

APP_DIR="/opt/infj-gallery"
PORT=8765

echo "==> 安装 python3"
apt-get update -y
apt-get install -y python3

echo "==> 准备目录 ${APP_DIR}"
mkdir -p "${APP_DIR}"
# 若脚本与站点同目录，则复制文件
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/server.py" ]; then
  cp -a "${SCRIPT_DIR}/." "${APP_DIR}/"
fi

cat > /etc/systemd/system/infj-gallery.service <<EOF
[Unit]
Description=INFJ photo gallery (CN)
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/python3 ${APP_DIR}/server.py
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
EOF

# www-data 需要写 data/
mkdir -p "${APP_DIR}/data/uploads"
chown -R www-data:www-data "${APP_DIR}/data" || true
chmod +x "${APP_DIR}/server.py"

systemctl daemon-reload
systemctl enable infj-gallery
systemctl restart infj-gallery

echo "==> 开放防火墙（如有 ufw）"
if command -v ufw >/dev/null 2>&1; then
  ufw allow ${PORT}/tcp || true
fi

IP="$(curl -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')"
echo ""
echo "========================================"
echo "国内共享相册已启动"
echo "访问: http://${IP}:${PORT}"
echo "安全组请放行 TCP ${PORT}"
echo "========================================"
systemctl --no-pager --full status infj-gallery | head -n 20
