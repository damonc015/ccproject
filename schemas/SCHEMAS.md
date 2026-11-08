# Person 4 execution contract

Person 2 creates the job and sends the message. Person 4 runs it and updates the item. Person 3 reads the item. Person 1 displays it.

These names stay fixed once this file is merged.

## Resources

| Resource | Name |
|---|---|
| SQS queue | `RunQueue` |
| Dead-letter queue | `RunQueueDLQ` |
| DynamoDB table | `RunStatus` |
| Partition key | `jobId` (string) |
| Lambda | `LF4Dispatcher` |
| ECS cluster | `SandboxCluster` |
| Task definition | `SandboxPython` |
| ECR repository | `sandbox-python` |
| Container name | `sandbox` |
| Language | `python` only |

## SQS message

Person 2 sends this as the message body. Person 4 also uses it for CLI tests.

```json
{
  "jobId": "8f3c2a10-6b4e-4d2a-9c11-0a7e5b1d44c2",
  "documentId": "doc_123",
  "requestedBy": "cognito-user-sub",
  "language": "python",
  "code": "print('Hello world')",
  "stdin": "",
  "timeoutSec": 10
}
```

| Field | Required | Rule |
|---|---|---|
| `jobId` | yes | UUID. Primary key of the `RunStatus` item. |
| `documentId` | yes in production | Person 3 uses it to check who may see the run. CLI tests may omit it. |
| `requestedBy` | yes in production | Cognito user sub. CLI tests may omit it. |
| `language` | yes | Only `python`. Any other value is stored as `failed` with `error` `BAD_LANGUAGE`. |
| `code` | yes | Full source string. Maximum 7,000 characters. Longer source is `failed` with `error` `CODE_TOO_LARGE`. |
| `stdin` | no | Reserved. An empty string means no input. |
| `timeoutSec` | no | Person 4 clamps this to a maximum of 10 seconds. |

## RunStatus item

| Attribute | Type | Written by | Meaning |
|---|---|---|---|
| `jobId` | S | Person 2 | Partition key |
| `documentId` | S | Person 2 | Used by Person 3 for the access check |
| `requestedBy` | S | Person 2 | Cognito sub |
| `language` | S | Person 2 | `python` |
| `status` | S | Person 2, then Person 4 | `queued`, `running`, `completed`, or `failed` |
| `stdout` | S | Person 4 | Program output, cut at 20,000 characters |
| `stderr` | S | Person 4 | Error output, cut at 20,000 characters |
| `exitCode` | N | Person 4 | Process exit code. A timeout uses `124`. |
| `error` | S | Person 4 | Empty on success. Otherwise `TIMEOUT`, `BAD_LANGUAGE`, `CODE_TOO_LARGE`, or `DISPATCH_FAILED`. |
| `createdAt` | S | Person 2 | ISO-8601 time when the job was queued |
| `startedAt` | S | Person 4 | ISO-8601 time when status becomes `running` |
| `finishedAt` | S | Person 4 | ISO-8601 time when status becomes `completed` or `failed` |
| `taskArn` | S | Person 4 | Fargate task ARN |
| `ttl` | N | Person 2 | Optional Unix epoch expiry |

Person 2 writes the item with `status` set to `queued` before sending the SQS message. Person 4 changes `queued` to `running` only if the item is still `queued`. A second delivery of the same message does not start another task.

A timeout stays `status` `failed` with `error` `TIMEOUT` and `exitCode` `124`.

## Status API

Person 3 returns these fields for one `jobId`: `status`, `stdout`, `stderr`, `exitCode`, `error`, `startedAt`, `finishedAt`. Person 1 polls until `status` is `completed` or `failed`.
