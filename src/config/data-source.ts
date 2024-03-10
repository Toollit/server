import 'reflect-metadata';
import './dotenvConfig'; // I set dotenv in app.ts, but the reason I set it here is because there is a problem that the env value is undefined when db sync with the npm run typeorm command.
import { DataSource } from 'typeorm';
import path from 'path';
import mysql2 from 'mysql2';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_ENDPOINT,
  port: 3306,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  synchronize: false,
  logging: true,
  entities: [path.join(__dirname, '../entity/**/*.{ts,js}')],
  migrations: [path.join(__dirname, '../migrations/*.{ts,js}')],
  subscribers: [],
  charset: 'utf8mb4_unicode_ci',
  driver: mysql2,
});
