# Person 4 handoff: code execution

Person 4 owns the path that runs a document's Python source. The editor, the collaboration server, and the REST API are not part of this work. Those pieces connect to a queue and a table that already exist.

Field names are frozen in `schemas/SCHEMAS.md`. This file says what has been built and what each person does next.

## What is done

The execution path is implemented on branch `person4/execution-sandbox` and pull request https://github.com/damonc015/ccproject/pull/1.

- `schemas/SCHEMAS.md` defines the SQS message and the `RunStatus` item.
- `sandbox/runner.py` runs one Python program inside a container, with a maximum of 10 seconds and output cut at 20,000 characters. It records stdout, stderr, the exit code, and the final status.
- `infra/lib/base-stack.ts` creates the VPC, private subnets with no internet route, and the endpoints the sandbox needs.
- `infra/lib/exec-stack.ts` creates the queue, the table, the Fargate task, and the dispatcher Lambda `LF4Dispatcher`.
- `infra/lambda/lf4.mjs` reads `RunQueue`, starts one sandbox task per new job, and ignores a second delivery of a job that has already started.

The stacks deploy into account `521294962730`, region `us-east-1`. Person 4 runs `npx cdk deploy --all` from `ccproject/infra` when the team is ready to test against AWS. They are not left running between sessions, because the VPC endpoints bill hourly. The names and ARNs below stay the same after each deploy.

| Resource | Value |
|---|---|
| Region | `us-east-1` |
| Queue URL | `https://sqs.us-east-1.amazonaws.com/521294962730/RunQueue` |
| Queue ARN | `arn:aws:sqs:us-east-1:521294962730:RunQueue` |
| Dead-letter queue | `RunQueueDLQ` |
| Table name | `RunStatus` |
| Table ARN | `arn:aws:dynamodb:us-east-1:521294962730:table/RunStatus` |
| Partition key | `jobId` (string) |
| Lambda | `LF4Dispatcher` |
| Cluster | `SandboxCluster` |

A message can be delivered twice. LF4 starts a task only when `status` is `queued` or the row does not exist yet. At most two jobs run at the same time. The only supported language is `python`. Source longer than 7,000 characters is rejected. A requested timeout above 10 seconds is lowered to 10.

## What was tested

These jobs were sent straight to `RunQueue` and read back from `RunStatus`.

| Job | Program | Result |
|---|---|---|
| `test-1` | `print("Hello world")` | `completed`, stdout `Hello world\n`, exit `0` |
| `test-syntax` | `def` | `failed`, exit `1`, stderr contains `SyntaxError`, error `NONZERO_EXIT` |
| `test-2` | `sys.exit(2)` | `failed`, stderr `bad\n`, exit `2`, error `NONZERO_EXIT` |
| `test-3` | `time.sleep(30)` with `timeoutSec` 2 | `failed`, exit `124`, error `TIMEOUT`, Fargate task `STOPPED` |
| `test-1` sent again | same message | Same `taskArn` and `finishedAt`. No second task started. |

The first run after a deploy takes about a minute because Fargate pulls the image. Later runs are shorter.

## How a run moves

1. Person 2 writes a `RunStatus` row with `status` `queued`, then sends the SQS message.
2. LF4 sets that row to `running` and starts one Fargate container.
3. `runner.py` runs the source and sets `completed` or `failed`, plus stdout, stderr, exit code, and `finishedAt`.
4. Person 3 reads the row by `jobId` and checks that the caller can access `documentId`.
5. Person 1 polls Person 3 until `status` is `completed` or `failed`, then displays the output.

Person 4 does not check Cognito tokens and does not know who is allowed to edit a document. Person 2 must only enqueue code the user is allowed to run.

## Person 2: create the job

On Run, read the current shared document text. Generate a new UUID for `jobId`. Write the DynamoDB item first, then send the queue message.

The item Person 2 writes:

| Attribute | Value |
|---|---|
| `jobId` | The new UUID |
| `documentId` | The open document |
| `requestedBy` | The Cognito user sub |
| `language` | `python` |
| `status` | `queued` |
| `createdAt` | Current time, ISO-8601 |
| `ttl` | Optional Unix expiry |

The message body:

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

`code` is the full source string, at most 7,000 characters. `stdin` can be an empty string. Return `jobId` to the browser so Person 1 can poll.

The collaboration server role needs `dynamodb:PutItem` on the `RunStatus` ARN and `sqs:SendMessage` on the `RunQueue` ARN. Use this table. Do not create another run table.

## Person 3: serve the status

Add a read endpoint, for example `GET /documents/{documentId}/runs/{jobId}`.

Load the `RunStatus` item with `GetItem` on partition key `jobId`. Confirm the caller may access the row's `documentId`. Return:

- `status`
- `stdout`
- `stderr`
- `exitCode`
- `error`
- `startedAt`
- `finishedAt`

`status` is one of `queued`, `running`, `completed`, or `failed`. `error` is an empty string on success. Otherwise it is `NONZERO_EXIT`, `TIMEOUT`, `BAD_LANGUAGE`, `CODE_TOO_LARGE`, or `DISPATCH_FAILED`. A program that exits with a code other than 0 is `failed` with `NONZERO_EXIT`. A timeout is `failed` with `TIMEOUT` and `exitCode` 124.

The Lambda role needs `dynamodb:GetItem` on the `RunStatus` ARN only. Import the existing table. Do not define a second table with different attribute names.

## Person 1: show the result

After Run, keep the `jobId` returned by Person 2. Poll Person 3 about once every second or two. Stop when `status` is `completed` or `failed`. Show `stdout` and `stderr`. A run can stay `queued` or `running` for about a minute on a cold start.

## Names that stay fixed

Do not rename `RunQueue`, `RunStatus`, or `jobId`. Do not change the status strings. Person 4 redeploys these stacks from `ccproject/infra` with `npx cdk deploy --all`. After a redeploy the URLs and ARNs above stay the same.

The interface endpoints in `BaseStack` bill about one cent each per hour while the stacks exist. Person 4 deletes them with `npx cdk destroy --all` when nobody is integrating. Ask before an integration session so the stacks are up.
