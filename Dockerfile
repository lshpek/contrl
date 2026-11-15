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

CMD sh -c "python -m alembic -c backend/alembic.ini upgrade head && PYTHONPATH=backend python -m app.bootstrap_owner || true && PYTHONPATH=backend python -c \"from app.database import SessionLocal; from app.models import User; from app.config import settings; db = SessionLocal(); u = db.query(User).filter(User.is_owner.is_(True)).first(); (setattr(u, 'telegram_user_id', settings.admin_telegram_chat_id), db.commit()) if (u and settings.admin_telegram_chat_id and not u.telegram_user_id) else None\" && uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-8080}"
