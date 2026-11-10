import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

interface ExecStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  taskSecurityGroup: ec2.ISecurityGroup;
}

export class ExecStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ExecStackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "RunStatus", {
      tableName: "RunStatus",
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const deadLetterQueue = new sqs.Queue(this, "RunQueueDLQ", {
      queueName: "RunQueueDLQ",
    });
    const queue = new sqs.Queue(this, "RunQueue", {
      queueName: "RunQueue",
      visibilityTimeout: cdk.Duration.seconds(180),
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 3 },
    });

    new ecr.Repository(this, "SandboxPythonRepo", {
      repositoryName: "sandbox-python",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
    const image = new ecrAssets.DockerImageAsset(this, "SandboxImage", {
      directory: path.join(__dirname, "../../sandbox"),
      platform: ecrAssets.Platform.LINUX_ARM64,
    });

    const cluster = new ecs.Cluster(this, "SandboxCluster", {
      vpc: props.vpc,
      clusterName: "SandboxCluster",
    });
    const logGroup = new logs.LogGroup(this, "SandboxLogs", {
      logGroupName: "/ecs/SandboxPython",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const taskDefinition = new ecs.FargateTaskDefinition(this, "SandboxPython", {
      family: "SandboxPython",
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    taskDefinition.addContainer("sandbox", {
      containerName: "sandbox",
      image: ecs.ContainerImage.fromDockerImageAsset(image),
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "sandbox" }),
      environment: {
        TABLE_NAME: table.tableName,
        LOCAL_ONLY: "0",
      },
    });

    table.grant(taskDefinition.taskRole, "dynamodb:GetItem", "dynamodb:UpdateItem");

    const privateSubnets = props.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    });
    const lf4 = new lambda.Function(this, "LF4", {
      functionName: "LF4Dispatcher",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lf4.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda")),
      timeout: cdk.Duration.seconds(120),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
        CLUSTER_NAME: cluster.clusterName,
        TASK_DEFINITION_ARN: taskDefinition.taskDefinitionArn,
        SUBNET_IDS: cdk.Fn.join(",", privateSubnets.subnetIds),
        TASK_SECURITY_GROUP_ID: props.taskSecurityGroup.securityGroupId,
      },
    });
    lf4.addEventSource(new SqsEventSource(queue, { batchSize: 1, maxConcurrency: 2}));
    table.grant(lf4, "dynamodb:GetItem", "dynamodb:UpdateItem");

    const executionRole = taskDefinition.executionRole;
    if (!executionRole) {
      throw new Error("Fargate task definition is missing an execution role");
    }
    lf4.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ecs:RunTask"],
      resources: [taskDefinition.taskDefinitionArn],
      conditions: { ArnEquals: { "ecs:cluster": cluster.clusterArn } },
    }));
    lf4.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ecs:DescribeTasks", "ecs:StopTask"],
      resources: [
        `arn:aws:ecs:${this.region}:${this.account}:task/${cluster.clusterName}/*`,
      ],
    }));
    lf4.addToRolePolicy(new iam.PolicyStatement({
      actions: ["iam:PassRole"],
      resources: [taskDefinition.taskRole.roleArn, executionRole.roleArn],
      conditions: {
        StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" },
      },
    }));

    new cdk.CfnOutput(this, "QueueUrl", { value: queue.queueUrl });
    new cdk.CfnOutput(this, "RunStatusTableName", { value: table.tableName });
  }
}