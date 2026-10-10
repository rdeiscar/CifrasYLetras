#!/usr/bin/env bash
# Instalador para servidores Linux (Debian/Ubuntu).
# Uso:  sudo bash deploy/install.sh
set -euo pipefail

APP_NAME="cifras-y-letras"
APP_DIR="/opt/${APP_NAME}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Cifras y Letras: instalando en ${APP_DIR}"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: ejecuta con sudo." >&2
  exit 1
fi

# --- Node.js 20 si falta ---
if ! command -v node >/dev/null 2>&1 || [[ $(node -p 'process.versions.node.split(".")[0]') -lt 18 ]]; then
  echo "==> Instalando Node.js 20 (Nodesource)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "==> Node $(node -v) y npm $(npm -v)"

# --- Usuario de servicio ---
if ! id -u cifras >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin cifras
fi

# --- Copia de la aplicación ---
mkdir -p "${APP_DIR}"
cp -r "${SRC_DIR}/server" "${SRC_DIR}/public" "${SRC_DIR}/data" "${SRC_DIR}/scripts" "${APP_DIR}/"
if [[ -f "${SRC_DIR}/package.json" ]]; then cp "${SRC_DIR}/package.json" "${APP_DIR}/"; fi
if [[ -f "${SRC_DIR}/package-lock.json" ]]; then cp "${SRC_DIR}/package-lock.json" "${APP_DIR}/"; fi

cd "${APP_DIR}"
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm no está disponible." >&2
  exit 1
fi
npm install --omit=dev --no-audit --no-fund

chown -R cifras:cifras "${APP_DIR}"

# --- Configuración opcional ---
ENV_FILE="/etc/${APP_NAME}.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  cat > "${ENV_FILE}" <<EOF
# Configuración de Cifras y Letras (opcional)
#PORT=3000
#ROOM_NAME=Mi sala
#ROUND_TIME_SECONDS=60
#NUM_ROUNDS=8
#MIN_WORD_LENGTH=3
#POINTS_EXACT=10
#POINTS_CLOSE=8
EOF
fi

# --- Unidad systemd ---
cp "${SRC_DIR}/deploy/${APP_NAME}.service" "/etc/systemd/system/${APP_NAME}.service"
systemctl daemon-reload
systemctl enable "${APP_NAME}"
systemctl restart "${APP_NAME}"

echo ""
echo "==> Instalado. Estado del servicio:"
systemctl --no-pager status "${APP_NAME}" --lines=0 || true
echo ""
echo "==> Abre en el navegador:  http://$(hostname -I | awk '{print $1}'):$(grep -oP 'PORT=\K[0-9]+' "${ENV_FILE}" || echo 3000)"
echo "    (logs: journalctl -u ${APP_NAME} -f)"
echo "    (parar/arrancar: systemctl stop/start ${APP_NAME})"