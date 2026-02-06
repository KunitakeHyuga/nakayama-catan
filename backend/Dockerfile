FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/catanatron

COPY backend/app/ .

RUN pip install --upgrade pip \
    && pip install '.[web]'

ENV FLASK_APP=catanatron.web/catanatron.web \
    FLASK_RUN_HOST=0.0.0.0 \
    FLASK_RUN_PORT=5001

EXPOSE 5001

CMD ["flask", "run"]
