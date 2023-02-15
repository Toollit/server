import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Tables } from './entity/index';
import dotenv from 'dotenv';
dotenv.config();

const isDev = process.env.NODE_ENV === 'development';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_ENDPOINT,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  synchronize: isDev ?? false,
  logging: true,
  entities: Tables,
  migrations: [],
  subscribers: [],
});
