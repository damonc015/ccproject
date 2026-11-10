import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  StopTaskCommand,
} from "@aws-sdk/client-ecs";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ecs = new ECSClient({});
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const MAX_CODE = 7000;
const MAX_TIMEOUT = 10;
const WAIT_MS = 90_000;

function clampTimeout(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return MAX_TIMEOUT;
  return Math.min(MAX_TIMEOUT, Math.max(1, Math.floor(value)));
}

async function writeFailed(jobId, errorCode) {
  if (!jobId) return;
  try {
    await doc.send(new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { jobId },
      UpdateExpression: "SET #s = :failed, #error = :error, finishedAt = :now",
      ConditionExpression: "attribute_not_exists(#s) OR #s = :queued OR #s = :running",
      ExpressionAttributeNames: { "#s": "status", "#error": "error" },
      ExpressionAttributeValues: {
        ":failed": "failed",
        ":queued": "queued",
        ":running": "running",
        ":error": errorCode,
        ":now": new Date().toISOString(),
      },
    }));
  } catch (error) {
    if (error.name !== "ConditionalCheckFailedException") throw error;
  }
}

async function claim(message) {
  try {
    await doc.send(new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { jobId: message.jobId },
      UpdateExpression:
        "SET #s = :running, startedAt = :now, #lang = :lang, documentId = if_not_exists(documentId, :doc), requestedBy = if_not_exists(requestedBy, :user)",
      ConditionExpression: "attribute_not_exists(#s) OR #s = :queued",
      ExpressionAttributeNames: { "#s": "status", "#lang": "language" },
      ExpressionAttributeValues: {
        ":running": "running",
        ":queued": "queued",
        ":now": new Date().toISOString(),
        ":lang": message.language,
        ":doc": message.documentId ?? "",
        ":user": message.requestedBy ?? "",
      },
    }));
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

async function waitForStop(taskArn) {
  const deadline = Date.now() + WAIT_MS;
  let task;
  while (Date.now() < deadline) {
    const described = await ecs.send(new DescribeTasksCommand({
      cluster: process.env.CLUSTER_NAME,
      tasks: [taskArn],
    }));
    task = described.tasks?.[0];
    if (task?.lastStatus === "STOPPED") return task;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return task;
}

async function handleBody(body) {
  let message;
  try {
    message = JSON.parse(body);
  } catch {
    return;
  }

  const jobId = typeof message.jobId === "string" ? message.jobId : "";
  const code = typeof message.code === "string" ? message.code : "";
  const language = typeof message.language === "string" ? message.language : "";

  if (!jobId || !code) {
    await writeFailed(jobId, "DISPATCH_FAILED");
    return;
  }
  if (language !== "python") {
    await writeFailed(jobId, "BAD_LANGUAGE");
    return;
  }
  if (code.length > MAX_CODE) {
    await writeFailed(jobId, "CODE_TOO_LARGE");
    return;
  }

  const claimed = await claim({ ...message, jobId, language });
  if (!claimed) return;

  let started;
  try {
    started = await ecs.send(new RunTaskCommand({
      cluster: process.env.CLUSTER_NAME,
      taskDefinition: process.env.TASK_DEFINITION_ARN,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: process.env.SUBNET_IDS.split(","),
          securityGroups: [process.env.TASK_SECURITY_GROUP_ID],
          assignPublicIp: "DISABLED",
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: "sandbox",
            environment: [
              { name: "JOB_ID", value: jobId },
              { name: "TABLE_NAME", value: process.env.TABLE_NAME },
              { name: "CODE", value: code },
              { name: "STDIN", value: message.stdin ?? "" },
              { name: "TIMEOUT_SEC", value: String(clampTimeout(message.timeoutSec)) },
              { name: "LOCAL_ONLY", value: "0" },
            ],
          },
        ],
      },
    }));
  } catch {
    await writeFailed(jobId, "DISPATCH_FAILED");
    return;
  }

  const taskArn = started.tasks?.[0]?.taskArn;
  if (!taskArn || (started.failures && started.failures.length > 0)) {
    await writeFailed(jobId, "DISPATCH_FAILED");
    return;
  }

  await doc.send(new UpdateCommand({
    TableName: process.env.TABLE_NAME,
    Key: { jobId },
    UpdateExpression: "SET taskArn = :arn",
    ExpressionAttributeValues: { ":arn": taskArn },
  }));

  const task = await waitForStop(taskArn);
  if (task?.lastStatus !== "STOPPED") {
    await ecs.send(new StopTaskCommand({
      cluster: process.env.CLUSTER_NAME,
      task: taskArn,
      reason: "LF4 deadline",
    }));
    await writeFailed(jobId, "TIMEOUT");
    return;
  }

  await writeFailed(jobId, "DISPATCH_FAILED");
}

export async function handler(event) {
  for (const record of event.Records ?? []) {
    await handleBody(record.body);
  }
}