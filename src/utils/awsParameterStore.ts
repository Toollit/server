import {
  SSMClient,
  GetParameterCommand,
  GetParameterRequest,
} from '@aws-sdk/client-ssm';

const isDev = process.env.NODE_ENV === 'development';
const NODE_ENV = process.env.NODE_ENV === 'development' ? 'dev' : 'prod';

const envPath = `/${NODE_ENV}/toollit/server/env`;

const databaseKeys = {
  DB_ENDPOINT: `${envPath}/DB_ENDPOINT`,
  DB_USERNAME: `${envPath}/DB_USERNAME`,
  DB_PASSWORD: `${envPath}/DB_PASSWORD`,
  DB_DATABASE: `${envPath}/DB_DATABASE`,
};

const appKeys = {
  ORIGIN_URL: `${envPath}/ORIGIN_URL`,
  COOKIE_SECRET: `${envPath}/COOKIE_SECRET`,
};

const hiworksKeys = {
  HIWORKS_EMAIL_USER: `${envPath}/HIWORKS_EMAIL_USER`,
  HIWORKS_EMAIL_PASS: `${envPath}/HIWORKS_EMAIL_PASS`,
};

const googleKeys = {
  GOOGLE_CLIENT_ID: `${envPath}/GOOGLE_CLIENT_ID`,
  GOOGLE_CLIENT_SECRET: `${envPath}/GOOGLE_CLIENT_SECRET`,
  GOOGLE_CALLBACK_URL: `${envPath}/GOOGLE_CALLBACK_URL`,
};

const githubKeys = {
  GITHUB_CLIENT_ID: `${envPath}/GITHUB_CLIENT_ID`,
  GITHUB_CLIENT_SECRET: `${envPath}/GITHUB_CLIENT_SECRET`,
  GITHUB_CALLBACK_URL: `${envPath}/GITHUB_CALLBACK_URL`,
};

const awsKeys = {
  AWS_S3_ACCESS_KEY_ID: `${envPath}/AWS_S3_ACCESS_KEY_ID`,
  AWS_S3_SECRET_ACCESS_KEY: `${envPath}/AWS_S3_SECRET_ACCESS_KEY`,
  AWS_S3_BUCKET_NAME: `${envPath}/AWS_S3_BUCKET_NAME`,
  AWS_S3_BUCKET_REGION: `${envPath}/AWS_S3_BUCKET_REGION`,
  AWS_S3_TOOLLIT_LOGO_IMAGE_URL: `${envPath}/AWS_S3_TOOLLIT_LOGO_IMAGE_URL`,
  AWS_ACCESS_KEY_ID: `${envPath}/AWS_ACCESS_KEY_ID`,
  AWS_SECRET_ACCESS_KEY: `${envPath}/AWS_SECRET_ACCESS_KEY`,
  AWS_DEFAULT_REGION: `${envPath}/AWS_DEFAULT_REGION`,
};

const redisKeys = {
  REDIS_HOST: `${envPath}/REDIS_HOST`,
  REDIS_PORT: `${envPath}/REDIS_PORT`,
  REDIS_USERNAME: `${envPath}/REDIS_USERNAME`,
  REDIS_PASSWORD: `${envPath}/REDIS_PASSWORD`,
  REDIS_CLOUD: `${envPath}/REDIS_CLOUD`,
};

const env = {
  ...databaseKeys,
  ...appKeys,
  ...hiworksKeys,
  ...googleKeys,
  ...githubKeys,
  ...awsKeys,
  ...redisKeys,
};

type key =
  | keyof typeof databaseKeys
  | keyof typeof appKeys
  | keyof typeof hiworksKeys
  | keyof typeof googleKeys
  | keyof typeof githubKeys
  | keyof typeof awsKeys
  | keyof typeof redisKeys;

interface ParameterKey {
  key: key;
}

const client = new SSMClient({
  region: 'ap-northeast-2',
});

function getValueByKey({ key }: ParameterKey): (typeof env)[key] {
  return env[key];
}

const getParameterStore = async ({ key }: ParameterKey) => {
  if (isDev) {
    const value = process.env[key];
    return value;
  }

  const parameterStorePath = getValueByKey({ key });

  const params: GetParameterRequest = {
    Name: parameterStorePath,
    WithDecryption: true,
  };
  const command = new GetParameterCommand(params);

  try {
    const data = await client.send(command);

    const value = data.Parameter?.Value;

    if (!value) {
      throw new Error('The parameter store has no value.');
    }

    return value;
  } catch (err) {
    console.error('getParameterStore error =>', err);
    return '';
  }
};

export { getParameterStore };
