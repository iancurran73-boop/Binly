# Phase A worker — pure-HTTP adapters only (205 councils).
# Small enough to run on Render's free tier (~150 MB image).
# When you're ready for Phase B (Selenium, 91 more councils), swap to
# Dockerfile.selenium which adds Chrome and bumps you to a paid plan.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Build deps for some pure-Python wheels that compile native code (lxml etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "worker.py"]
