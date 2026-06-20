FROM mcr.microsoft.com/devcontainers/python:3.10-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    YT_DLP_SOURCE=/opt/yt-dlp-master \
    YT_CACHE_DIR=/yt-cache \
    PORT=8088

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir flask yt-dlp

COPY app.py /app/app.py

RUN mkdir -p /yt-cache/jobs

ENV PATH="/opt/venv/bin:${PATH}"

EXPOSE 8088

CMD ["python", "-u", "/app/app.py"]
