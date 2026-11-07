import json
import os
import subprocess
import sys
from datetime import datetime, timezone

MAX_TIMEOUT = 10
MAX_OUTPUT = 20000


def clamp_timeout(raw):
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = MAX_TIMEOUT
    if value < 1:
        return 1
    if value > MAX_TIMEOUT:
        return MAX_TIMEOUT
    return value


def cut(text):
    if text is None:
        return ""
    if len(text) <= MAX_OUTPUT:
        return text
    return text[:MAX_OUTPUT]


def record(result):
    print(json.dumps(result))
    if os.environ.get("LOCAL_ONLY", "1") == "1":
        return
    table_name = os.environ.get("TABLE_NAME", "")
    job_id = os.environ.get("JOB_ID", "")
    if not table_name or not job_id:
        return

    import boto3
    from botocore.exceptions import ClientError

    table = boto3.resource("dynamodb").Table(table_name)
    try:
        table.update_item(
            Key={"jobId": job_id},
            UpdateExpression=(
                "SET #s = :status, stdout = :out, stderr = :err, "
                "exitCode = :code, #error = :error, finishedAt = :now"
            ),
            ConditionExpression="attribute_not_exists(#s) OR #s = :running",
            ExpressionAttributeNames={"#s": "status", "#error": "error"},
            ExpressionAttributeValues={
                ":status": result["status"],
                ":out": result["stdout"],
                ":err": result["stderr"],
                ":code": result["exitCode"],
                ":error": result["error"],
                ":running": "running",
                ":now": datetime.now(timezone.utc).isoformat(),
            },
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code != "ConditionalCheckFailedException":
            raise


def main():
    code = os.environ.get("CODE", "")
    stdin_data = os.environ.get("STDIN", "")
    timeout_sec = clamp_timeout(os.environ.get("TIMEOUT_SEC", str(MAX_TIMEOUT)))
    source_path = "/tmp/main.py"

    with open(source_path, "w", encoding="utf-8") as source_file:
        source_file.write(code)

    child_env = os.environ.copy()
    for key in (
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    ):
        child_env.pop(key, None)

    try:
        completed = subprocess.run(
            [sys.executable, source_path],
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            env=child_env,
        )
        status = "completed" if completed.returncode == 0 else "failed"
        result = {
            "status": status,
            "stdout": cut(completed.stdout),
            "stderr": cut(completed.stderr),
            "exitCode": completed.returncode,
            "error": "" if completed.returncode == 0 else "NONZERO_EXIT",
        }
    except subprocess.TimeoutExpired as timed_out:
        result = {
            "status": "failed",
            "stdout": cut(timed_out.stdout),
            "stderr": cut(timed_out.stderr),
            "exitCode": 124,
            "error": "TIMEOUT",
        }

    record(result)


if __name__ == "__main__":
    main()