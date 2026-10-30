# ShadowScope backend for an optional free deployment, in cloud mode: no collectors or gateway, and a public-safe API.
FROM python:3.12-slim

WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
COPY detector detector
RUN pip install --no-cache-dir -r backend/requirements.txt && pip install --no-cache-dir ./detector

COPY backend/app backend/app
COPY contracts/mock contracts/mock

RUN useradd --create-home shadowscope && mkdir -p backend/data && chown -R shadowscope backend/data
USER shadowscope

ENV SHADOWSCOPE_CLOUD=1 PYTHONUNBUFFERED=1
WORKDIR /srv/backend
EXPOSE 8787
# Render sets PORT. --proxy-headers gives the rate limit each caller's address rather than the proxy's.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8787} --proxy-headers --forwarded-allow-ips='*'"]
