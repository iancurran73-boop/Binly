FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

# Chrome + driver dependencies for Selenium
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg fonts-liberation \
        libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
        libcups2 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
        libwayland-client0 libxcomposite1 libxdamage1 libxfixes3 \
        libxkbcommon0 libxrandr2 wget xdg-utils \
    && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["python", "worker.py"]
