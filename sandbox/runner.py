import json
import os
import subprocess
import sys

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
    if len(text) <= MAX_OUTPUT:
        return text
    return text[:MAX_OUTPUT]


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
            "stdout": cut(timed_out.stdout or ""),
            "stderr": cut(timed_out.stderr or ""),
            "exitCode": 124,
            "error": "TIMEOUT",
        }

    print(json.dumps(result))


if __name__ == "__main__":
    main()