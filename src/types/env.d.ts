declare namespace NodeJS {
  interface ProcessEnv {
    readonly DB_ENDPOINT: string;
    readonly DB_PORT: string;
    readonly DB_USERNAME: string;
    readonly DB_PASSWORD: string;
    readonly DB_DATABASE: string;
    readonly ORIGIN_URL: string;
    readonly NODEMAILER_USER: string;
    readonly NODEMAILER_PASS: string;
    readonly COOKIE_SECRET: string;
    readonly GOOGLE_CLIENT_ID: string;
    readonly GOOGLE_CLIENT_SECRET: string;
    readonly GOOGLE_CALLBACK_URL: string;
    readonly S3_ACCESS_KEY_ID: string;
    readonly S3_SECRET_ACCESS_KEY: string;
    readonly S3_BUCKET_NAME: string;
    readonly S3_BUCKET_REGION: string;
  }
}
