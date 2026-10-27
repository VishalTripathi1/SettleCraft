import type { OpenAPIV3 } from 'openapi-types';
const json = (schema: OpenAPIV3.SchemaObject) => ({ 'application/json': { schema } });
const string: OpenAPIV3.SchemaObject = { type: 'string' };
const idParam: OpenAPIV3.ParameterObject = {
  in: 'path',
  name: 'id',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const key: OpenAPIV3.ParameterObject = {
  in: 'header',
  name: 'Idempotency-Key',
  required: true,
  schema: { type: 'string', minLength: 8, maxLength: 128 },
};
const object = (
  properties: Record<string, OpenAPIV3.SchemaObject>,
  required = Object.keys(properties),
): OpenAPIV3.SchemaObject => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const credentials = object({
  email: { type: 'string', format: 'email' },
  password: { type: 'string', minLength: 12, maxLength: 128 },
});
const decision = object({
  decision: { type: 'string', enum: ['APPROVE', 'REJECT'] },
  rationale: { type: 'string', minLength: 5, maxLength: 500 },
});
const money: OpenAPIV3.SchemaObject = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]{0,8})(\\.[0-9]{1,2})?$',
  example: '500.00',
};
const paths: OpenAPIV3.PathsObject = {};
function endpoint(
  path: string,
  method: 'get' | 'post' | 'patch',
  summary: string,
  options: {
    body?: OpenAPIV3.SchemaObject;
    public?: boolean;
    idempotent?: boolean;
    created?: boolean;
    noContent?: boolean;
    list?: boolean;
  } = {},
) {
  const parameters: OpenAPIV3.ParameterObject[] = [];
  if (path.includes('{id}')) parameters.push(idParam);
  if (options.idempotent) parameters.push(key);
  if (options.list)
    parameters.push(
      { in: 'query', name: 'page', schema: { type: 'integer', default: 1, minimum: 1 } },
      { in: 'query', name: 'search', schema: string },
    );
  const operation: OpenAPIV3.OperationObject = {
    summary,
    security: options.public ? [] : [{ bearer: [] }],
    parameters,
    responses: {
      [options.noContent ? '204' : options.created ? '201' : '200']: {
        description: 'Success. BIGINT amounts are serialized as strings.',
      },
      '401': { description: 'Unauthenticated' },
      '403': { description: 'Forbidden / invalid origin' },
      '409': { description: 'Conflict / state already decided' },
      '422': { description: 'Invalid input' },
      '429': { description: 'Rate limited' },
      '500': { description: 'Internal error' },
    },
  };
  if (options.body) operation.requestBody = { required: true, content: json(options.body) };
  paths[path] = { ...paths[path], [method]: operation };
}
endpoint('/health/live', 'get', 'Process liveness', { public: true });
endpoint('/health/ready', 'get', 'PostgreSQL readiness (503 when unavailable)', { public: true });
endpoint('/auth/register', 'post', 'Register a user with an empty wallet', {
  public: true,
  created: true,
  body: object({
    ...credentials.properties,
    name: { type: 'string', minLength: 2, maxLength: 80 },
  }),
});
endpoint('/auth/login', 'post', 'Sign in; return access token and set HttpOnly refresh cookie', {
  public: true,
  body: credentials,
});
endpoint(
  '/auth/refresh',
  'post',
  'Rotate cookie session. Requires exact Origin and X-SettleCraft-Client: web',
  { public: true },
);
endpoint('/auth/logout', 'post', 'Revoke cookie session. Same origin requirements as refresh', {
  public: true,
  noContent: true,
});
endpoint('/auth/me', 'get', 'Current user');
endpoint('/auth/change-password', 'post', 'Change password and revoke all sessions', {
  body: object({
    currentPassword: string,
    newPassword: { type: 'string', minLength: 12, maxLength: 128 },
  }),
  noContent: true,
});
endpoint('/users/me', 'patch', 'Change display name', {
  body: object({ name: { type: 'string', minLength: 2, maxLength: 80 } }),
});
endpoint('/users/lookup', 'get', 'Exact email recipient lookup');
paths['/users/lookup']!.get!.parameters = [
  { in: 'query', name: 'email', required: true, schema: { type: 'string', format: 'email' } },
];
endpoint('/wallets/me', 'get', 'Ledger-derived wallet balance in paise');
endpoint('/wallets/me/ledger-activity', 'get', 'Latest 20 posted entries', { list: true });
endpoint('/wallets/me/demo-topups', 'get', 'Latest 30 funding requests');
endpoint('/wallets/me/demo-topups', 'post', 'Request admin-approved demo issuance', {
  body: object({ amount: money }),
  idempotent: true,
  created: true,
});
endpoint('/transfers', 'post', 'Create an idempotent transfer intent', {
  body: object(
    {
      recipientId: { type: 'string', format: 'uuid' },
      amount: money,
      currency: { type: 'string', enum: ['INR'] },
      note: { type: 'string', maxLength: 160 },
    },
    ['recipientId', 'amount', 'currency'],
  ),
  idempotent: true,
  created: true,
});
endpoint('/transfers', 'get', 'Own transfers, page size 20, optional status/search filters', {
  list: true,
});
endpoint('/transfers/{id}', 'get', 'Owned transfer details (admins may inspect any transfer)');
for (const [path, summary] of [
  ['overview', 'Transfer aggregates and seven-day UTC activity'],
  ['transfers', 'All transfers; page size 20'],
  ['reviews', 'Oldest 100 held transfers with risk signals'],
  ['topups', 'Oldest 100 pending funding requests'],
  ['audit', 'Audit events; page size 30'],
  ['reconciliation', 'Latest 10 reconciliation runs'],
  ['risk-rules', 'Read-only deterministic policy'],
  ['events', 'Latest 30 outbox events'],
] as const)
  endpoint(`/admin/${path}`, 'get', `ADMIN: ${summary}`, {
    list: path === 'transfers' || path === 'audit',
  });
endpoint('/admin/reviews/{id}', 'post', 'ADMIN: decide held transfer and recheck funds', {
  body: decision,
});
endpoint('/admin/topups/{id}', 'post', 'ADMIN: approve or reject demo issuance', {
  body: decision,
});
endpoint('/admin/transfers/{id}/reverse', 'post', 'ADMIN: full compensating reversal', {
  body: object({ rationale: { type: 'string', minLength: 5, maxLength: 500 } }),
  idempotent: true,
});
endpoint(
  '/admin/reconciliation/run',
  'post',
  'ADMIN: persist a consistent-snapshot integrity check',
);
endpoint(
  '/webhooks/demo-provider',
  'post',
  'Local HMAC receiver: timestamp and signature headers, five-minute tolerance; duplicate event acknowledged without processing twice',
  {
    public: true,
    body: object({
      id: { type: 'string', format: 'uuid' },
      type: string,
      entityId: { type: 'string', format: 'uuid' },
    }),
  },
);
paths['/webhooks/demo-provider']!.post!.parameters = [
  { in: 'header', name: 'X-Webhook-Timestamp', required: true, schema: string },
  { in: 'header', name: 'X-Webhook-Signature', required: true, schema: string },
];
export const openapi: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'SettleCraft local demo API',
    version: '1.0.0',
    description:
      'Simulated INR only. Error envelope: {code,message,details?,requestId}. Never use for real funds.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
  paths,
};
