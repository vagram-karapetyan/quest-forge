# syntax=docker/dockerfile:1
FROM python:3.12-slim

# Отключаем буферизацию вывода Python и создание .pyc файлов
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src \
    TEXT_QUEST_HOST=0.0.0.0 \
    TEXT_QUEST_PORT=8000 \
    TEXT_QUEST_DB=/app/data/text_quest.db

WORKDIR /app

# Установка зависимостей и самого пакета
COPY pyproject.toml README.md main.py ./
COPY src/ ./src/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir "fastapi>=0.115.0" "uvicorn>=0.30.0" "sqlmodel>=0.0.22" "httpx>=0.27.0"

# Директория для сохранения базы данных SQLite
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import os, urllib.request; port = os.environ.get('TEXT_QUEST_PORT', '8000'); urllib.request.urlopen(f'http://127.0.0.1:{port}/health')" || exit 1

# Запуск сервера
CMD ["python", "main.py"]
