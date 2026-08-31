FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Conserver une copie des images initiales hors du Persistent Disk
RUN mkdir -p /app/seed_uploads && \
    cp -a /app/backend/static/uploads/. /app/seed_uploads/

WORKDIR /app/backend

EXPOSE 8080

CMD ["sh", "-c", "cp -an /app/seed_uploads/. /app/backend/static/uploads/ 2>/dev/null || true; gunicorn --bind 0.0.0.0:${PORT:-8080} app:app"]