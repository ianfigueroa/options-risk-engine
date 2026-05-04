FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV OPTIONS_YAHOO_MIN_INTERVAL_SECONDS=2.5
ENV OPTIONS_MARKET_SNAPSHOT_TTL_SECONDS=60
ENV OPTIONS_OPTION_QUOTE_TTL_SECONDS=120
ENV OPTIONS_OPTION_CHAIN_TTL_SECONDS=300

COPY pyproject.toml README.md ./
COPY python ./python
COPY api ./api

RUN pip install --no-cache-dir .

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
