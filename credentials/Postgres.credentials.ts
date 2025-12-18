import {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class Postgres implements ICredentialType {
  name = 'postgres';
  displayName = 'Postgres';
  documentationUrl = 'postgres';
  properties: INodeProperties[] = [
    {
      displayName: 'Host',
      name: 'host',
      type: 'string',
      default: 'localhost',
      required: true,
      description: 'PostgreSQL server hostname or IP address',
    },
    {
      displayName: 'Port',
      name: 'port',
      type: 'number',
      default: 5432,
      required: true,
      description: 'PostgreSQL server port',
    },
    {
      displayName: 'Database',
      name: 'database',
      type: 'string',
      default: '',
      required: true,
      description: 'Database name',
    },
    {
      displayName: 'User',
      name: 'user',
      type: 'string',
      default: '',
      required: true,
      description: 'PostgreSQL username',
    },
    {
      displayName: 'Password',
      name: 'password',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'PostgreSQL password',
    },
    {
      displayName: 'SSL',
      name: 'ssl',
      type: 'options',
      options: [
        {
          name: 'Disable',
          value: 'disable',
        },
        {
          name: 'Allow',
          value: 'allow',
        },
        {
          name: 'Require',
          value: 'require',
        },
        {
          name: 'Verify (Self-Signed)',
          value: 'verify-self-signed',
        },
        {
          name: 'Verify (CA)',
          value: 'verify-ca',
        },
      ],
      default: 'disable',
      description: 'SSL connection mode',
    },
    {
      displayName: 'Connection Timeout',
      name: 'connectionTimeoutMillis',
      type: 'number',
      default: 5000,
      description: 'Connection timeout in milliseconds',
    },
    {
      displayName: 'Max Pool Size',
      name: 'max',
      type: 'number',
      default: 20,
      description: 'Maximum number of connections in the pool',
    },
    {
      displayName: 'Idle Timeout',
      name: 'idleTimeoutMillis',
      type: 'number',
      default: 30000,
      description: 'How long a client must sit idle before being disconnected',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {},
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '',
      url: '',
    },
  };
}
