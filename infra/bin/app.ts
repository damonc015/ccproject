#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";
import { BaseStack } from "../lib/base-stack";
import { ExecStack } from "../lib/exec-stack";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

new AuthStack(app, "AuthStack", { env });

const base = new BaseStack(app, "BaseStack", { env });
new ExecStack(app, "ExecStack", {
  env,
  vpc: base.vpc,
  taskSecurityGroup: base.taskSecurityGroup,
});