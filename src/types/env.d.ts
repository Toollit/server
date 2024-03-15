declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production';
    readonly DB_ENDPOINT: string;
    readonly DB_USERNAME: string;
    readonly DB_PASSWORD: string;
    readonly DB_DATABASE: string;
    readonly ORIGIN_URL: string;
    readonly COOKIE_SECRET: string;
    readonly HIWORKS_EMAIL_USER: string;
    readonly HIWORKS_EMAIL_PASS: string;
    readonly GOOGLE_CLIENT_ID: string;
    readonly GOOGLE_CLIENT_SECRET: string;
    readonly GOOGLE_CALLBACK_URL: string;
    readonly GITHUB_CLIENT_ID: string;
    readonly GITHUB_CLIENT_SECRET: string;
    readonly GITHUB_CALLBACK_URL: string;
    readonly AWS_S3_ACCESS_KEY_ID: string;
    readonly AWS_S3_SECRET_ACCESS_KEY: string;
    readonly AWS_S3_BUCKET_NAME: string;
    readonly AWS_S3_BUCKET_REGION: string;
    readonly AWS_S3_TOOLLIT_LOGO_IMAGE_URL: string;
    readonly REDIS_HOST: string;
    readonly REDIS_PORT: string;
    readonly REDIS_USERNAME: string;
    readonly REDIS_PASSWORD: string;
    readonly REDIS_CLOUD: string;
    readonly AWS_ACCESS_KEY_ID: string;
    readonly AWS_SECRET_ACCESS_KEY: string;
    readonly AWS_REGION: string;
  }
}
