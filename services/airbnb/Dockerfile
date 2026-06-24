FROM python:3.12-slim

WORKDIR /app

# supercronic — cron runner cho container (không dùng cron daemon)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && curl -fsSLo /usr/local/bin/supercronic \
       https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 \
    && chmod +x /usr/local/bin/supercronic \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Python deps + Playwright Chromium (--with-deps tự cài system libs)
COPY requirements.txt .
RUN apt-get update \
    && pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY . .

CMD ["supercronic", "/app/crontab"]
