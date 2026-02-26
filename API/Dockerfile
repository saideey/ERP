FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_ROOT_USER_ACTION=ignore \
    TZ=Asia/Tashkent

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl tzdata postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade "pip>=23.0,<24.0"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /app/uploads

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["bash", "-c", "\
    echo '⏳ Waiting for PostgreSQL...' && \
    while ! pg_isready -h db -p 5432 -U postgres > /dev/null 2>&1; do sleep 2; done && \
    echo '✅ PostgreSQL ready' && sleep 2 && \
    echo '🔄 Running migration...' && \
    alembic upgrade head && \
    echo '🌱 Seeding...' && \
    python -c 'from database.seed import seed_all; from database import db; seed_all(db.get_session_direct())' && \
    echo '🚀 Starting server...' && \
    exec uvicorn app:app --host 0.0.0.0 --port 8000 --reload \
"]
