FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY integrations/ ./integrations/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /data/uploads /data/backups
ENV SERVE_FRONTEND_DIST=true
ENV BIND_HOST=0.0.0.0

CMD sh -c "python -m alembic -c backend/alembic.ini upgrade head && uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-8000}"
