import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_ENDPOINT,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  synchronize: false,
  logging: true,
  entities: [path.join(__dirname, '/entity/**/*.{ts,js}')],
  migrations: [path.join(__dirname, '/migrations/*.{ts,js}')],
  subscribers: [],
  charset: 'utf8mb4_unicode_ci',
});
