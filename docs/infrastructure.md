# Infrastructure

## Subnets

| Subnet | Purpose | VPC endpoint resources |
| --- | --- | --- |
| `EsocialPrivateSubnet0` | Lambda, RDS, and private service traffic | SQS, Secrets Manager, KMS, EventBridge, CloudWatch Logs interface endpoints; S3 gateway endpoint route |
| `EsocialPrivateSubnet1` | Lambda, RDS, and private service traffic | SQS, Secrets Manager, KMS, EventBridge, CloudWatch Logs interface endpoints; S3 gateway endpoint route |

All AWS API traffic stays inside the VPC; no NAT or IGW exists on this stack.

## Security Groups

| Security group | Ingress | Egress | Purpose |
| --- | --- | --- | --- |
| `EsocialLambdaSecurityGroup` | Queue-triggered Lambda runtime ingress only | Private AWS API endpoints and database targets | Active service execution boundary |
| `EsocialEndpointSecurityGroup` | TCP 443 from `EsocialLambdaSecurityGroup` | None | Interface endpoint access for SQS, Secrets Manager, KMS, EventBridge, and CloudWatch Logs |

Interface endpoint policies allow only principals from the current AWS account
using an `aws:PrincipalAccount` condition. S3 uses a gateway endpoint because
Lambda artifacts and CloudFormation access do not require interface endpoint
security groups.

## WAF Protection

The http-gateway WebACL is attached only for `restricted-production` and
`production`. `qualification` remains unattached so authorized penetration
tests are not blocked by managed rule noise.

| Rule | Action |
| --- | --- |
| `AWSManagedRulesCommonRuleSet` | Managed rule group, override mode `NONE` |
| `AWSManagedRulesKnownBadInputsRuleSet` | Managed rule group, override mode `NONE` |
| `RateLimitPerIp` | Block after 2,000 requests per 5 minutes per IP |

The WebACL default action is `ALLOW`, with CloudWatch metrics and sampled
request logging enabled. The stack exposes the WebACL ARN as an operational
output for runbook and alarm wiring.
