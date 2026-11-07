FROM python:3.12-slim

RUN pip install --no-cache-dir boto3 \
 && useradd --create-home sandbox
COPY runner.py /opt/runner.py

USER sandbox
WORKDIR /tmp
ENTRYPOINT ["python", "/opt/runner.py"]