# Person 1 handoff: auth

Person 1 owns the Cognito user pool. Persons 2 and 3 verify its tokens. This file lists the values they need.

## What is deployed

`infra/lib/auth-stack.ts` creates the user pool and the browser client as `AuthStack`, in account `521294962730`, region `us-east-1`.

| Resource | Value |
|---|---|
| Region | `us-east-1` |
| User pool ID | `us-east-1_0205hn4wP` |
| User pool ARN | `arn:aws:cognito-idp:us-east-1:521294962730:userpool/us-east-1_0205hn4wP` |
| Web client ID | `3dnprbldgjj6na7dajg390cne4` |
| JWT issuer | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_0205hn4wP` |
| CloudFormation exports | `CcUserPoolId`, `CcUserPoolArn`, `CcUserPoolClientId` |

Users sign in with email and password. Passwords need at least 8 characters with a lowercase letter and a digit. Sign-up sends a verification code by email. The web client has no secret and uses SRP sign-in.

## Do not destroy this stack

`AuthStack` is separate from `BaseStack` on purpose. `npx cdk destroy --all` would remove it from CloudFormation, and a redeploy would create a new pool with a new ID and no users. Destroy `BaseStack` and `ExecStack` by name instead:

```
npx cdk destroy ExecStack BaseStack
```

The pool itself has `RemovalPolicy.RETAIN`, so it survives an accidental destroy, but the next deploy would then fail on the pool name until the old pool is removed or imported.

## Person 2: verify on connect

Use `aws-jwt-verify` with the pool ID and client ID above. The browser sends the Cognito ID token when it opens the WebSocket. The user's ID is the `sub` claim, the email is `email`, the display name is `name`.

```js
import { CognitoJwtVerifier } from "aws-jwt-verify";

const verifier = CognitoJwtVerifier.create({
  userPoolId: "us-east-1_0205hn4wP",
  tokenUse: "id",
  clientId: "3dnprbldgjj6na7dajg390cne4",
});
const claims = await verifier.verify(token);
```

## Person 3: API Gateway authorizer

Attach a Cognito user pool authorizer to the REST API using the pool ARN above, or import it in CDK:

```ts
const userPool = cognito.UserPool.fromUserPoolArn(this, "UserPool", cdk.Fn.importValue("CcUserPoolArn"));
const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "Authorizer", { cognitoUserPools: [userPool] });
```

The browser sends the ID token in the `Authorization` header. Lambda reads the caller from `event.requestContext.authorizer.claims.sub`.
