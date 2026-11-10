import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class BaseStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly taskSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    this.vpc.addGatewayEndpoint("S3", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    const dynamoEndpoint = this.vpc.addGatewayEndpoint("DynamoDb", {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    const endpointSecurityGroup = new ec2.SecurityGroup(this, "EndpointSecurityGroup", {
      vpc: this.vpc,
      description: "Interface endpoints for ECR and CloudWatch Logs",
      allowAllOutbound: true,
    });

    this.taskSecurityGroup = new ec2.SecurityGroup(this, "TaskSecurityGroup", {
      vpc: this.vpc,
      description: "Sandbox tasks. No inbound. Private AWS endpoints only.",
      allowAllOutbound: false,
    });

    const endpointServices = [
      ec2.InterfaceVpcEndpointAwsService.ECR,
      ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    ];
    for (const service of endpointServices) {
      this.vpc.addInterfaceEndpoint(`Endpoint${service.shortName}`, {
        service,
        securityGroups: [endpointSecurityGroup],
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      });
    }

    endpointSecurityGroup.addIngressRule(
      this.taskSecurityGroup,
      ec2.Port.tcp(443),
      "Sandbox tasks",
    );
    this.taskSecurityGroup.addEgressRule(
      endpointSecurityGroup,
      ec2.Port.tcp(443),
      "ECR and CloudWatch Logs",
    );

    const region = cdk.Stack.of(this).region;
    const s3Prefix = ec2.PrefixList.fromLookup(this, "S3Prefix", {
      prefixListName: `com.amazonaws.${region}.s3`,
    });
    const dynamoPrefix = ec2.PrefixList.fromLookup(this, "DynamoPrefix", {
      prefixListName: `com.amazonaws.${region}.dynamodb`,
    });
    this.taskSecurityGroup.addEgressRule(
      ec2.Peer.prefixList(s3Prefix.prefixListId),
      ec2.Port.tcp(443),
      "S3 gateway for image layers",
    );
    this.taskSecurityGroup.addEgressRule(
      ec2.Peer.prefixList(dynamoPrefix.prefixListId),
      ec2.Port.tcp(443),
      "DynamoDB gateway",
    );
    this.taskSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.udp(53),
      "VPC DNS",
    );
    this.taskSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(53),
      "VPC DNS",
    );

    dynamoEndpoint;

    const privateSubnets = this.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    });
    new cdk.CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
    new cdk.CfnOutput(this, "PrivateSubnetIds", {
      value: cdk.Fn.join(",", privateSubnets.subnetIds),
    });
    new cdk.CfnOutput(this, "TaskSecurityGroupId", {
      value: this.taskSecurityGroup.securityGroupId,
    });
  }
}