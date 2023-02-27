declare namespace NodeJS {
  interface ProcessEnv {
    readonly DB_ENDPOINT: string;
    readonly DB_PORT: string;
    readonly DB_USERNAME: string;
    readonly DB_PASSWORD: string;
    readonly NODEMAILER_USER: string;
    readonly NODEMAILER_PASS: string;
    readonly COOKIE_SECRET: string;
  }
}
