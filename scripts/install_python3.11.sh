#!/bin/bash
set -e

echo "=== 🔧 Установка зависимостей для сборки Python 3.11 ==="
sudo apt update
sudo apt install -y build-essential libssl-dev zlib1g-dev libncurses5-dev \
libncursesw5-dev libreadline-dev libsqlite3-dev libgdbm-dev libdb5.3-dev \
libbz2-dev libexpat1-dev liblzma-dev tk-dev libffi-dev xz-utils wget curl

# Конфигурация путей и версий
PY_VER="3.11.14"
# Разрешить переопределение через переменную окружения ARCHIVE_PATH
ARCHIVE_PATH="${ARCHIVE_PATH:-/home/vms/PycharmProjects/mDVR/Python-${PY_VER}.tar.xz}"
SRC_DIR="/usr/src"
BUILD_DIR="${SRC_DIR}/Python-${PY_VER}"

echo "=== 📦 Подготовка исходников Python ${PY_VER} (локальный архив) ==="
if [ ! -f "${ARCHIVE_PATH}" ]; then
  echo "Ошибка: не найден локальный архив ${ARCHIVE_PATH}"
  exit 1
fi

sudo mkdir -p "${SRC_DIR}"

echo "=== 📂 Распаковка ==="
sudo tar -xf "${ARCHIVE_PATH}" -C "${SRC_DIR}"
cd "${BUILD_DIR}"

echo "=== ⚙️ Конфигурация и сборка (может занять 10–30 мин на Raspberry Pi) ==="
sudo ./configure --enable-optimizations
sudo make -j$(nproc)

echo "=== 🚀 Установка (altinstall — чтобы не трогать системный python3) ==="
sudo make altinstall

echo "=== ⛔ Пропускаем смену системного python3 (без update-alternatives) ==="

echo "=== 🔍 Проверка версии установленного Python 3.11 ==="
/usr/local/bin/python3.11 --version

echo "=== 🎉 Установка Python 3.11 завершена успешно! ==="
