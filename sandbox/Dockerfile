FROM python:3.12-slim

RUN useradd --create-home sandbox
COPY runner.py /opt/runner.py

USER sandbox
WORKDIR /tmp
ENTRYPOINT ["python", "/opt/runner.py"]