declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production';
    readonly DB_ENDPOINT: string;
    readonly DB_USERNAME: string;
    readonly DB_PASSWORD: string;
    readonly DB_DATABASE: string;
    readonly ORIGIN_URL: string;
    readonly HIWORKS_EMAIL_USER: string;
    readonly HIWORKS_EMAIL_PASS: string;
    readonly COOKIE_SECRET: string;
    readonly GOOGLE_CLIENT_ID: string;
    readonly GOOGLE_CLIENT_SECRET: string;
    readonly GOOGLE_CALLBACK_URL: string;
    readonly S3_ACCESS_KEY_ID: string;
    readonly S3_SECRET_ACCESS_KEY: string;
    readonly S3_BUCKET_NAME: string;
    readonly S3_BUCKET_REGION: string;
    readonly TOOLLIT_LOGO_IMAGE_URL: string;
  }
}
