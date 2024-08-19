import 'reflect-metadata';
import './dotenvConfig'; // I set dotenv in app.ts, but the reason I set it here is because there is a problem that the env value is undefined when db sync with the npm run typeorm command.
import { DataSource } from 'typeorm';
import path from 'path';
import mysql2 from 'mysql2';
import { getParameterStore } from '@/utils/awsParameterStore';

export let AppDataSource: Readonly<DataSource>;

export const dataSource = (async () => {
  try {
    const DB_ENDPOINT = await getParameterStore({ key: 'DB_ENDPOINT' }).catch(
      (err) => {
        throw new Error(
          `Error during aws getParameterStore DB_ENDPOINT data fetch: ${err}`
        );
      }
    );
    const DB_USERNAME = await getParameterStore({ key: 'DB_USERNAME' }).catch(
      (err) => {
        throw new Error(
          `Error during aws getParameterStore DB_USERNAME data fetch: ${err}`
        );
      }
    );
    const DB_PASSWORD = await getParameterStore({ key: 'DB_PASSWORD' }).catch(
      (err) => {
        throw new Error(
          `Error during aws getParameterStore DB_PASSWORD data fetch: ${err}`
        );
      }
    );
    const DB_DATABASE = await getParameterStore({ key: 'DB_DATABASE' }).catch(
      (err) => {
        throw new Error(
          `Error during aws getParameterStore DB_DATABASE data fetch: ${err}`
        );
      }
    );

    const source = new DataSource({
      type: 'mysql',
      host: DB_ENDPOINT,
      port: 3306,
      username: DB_USERNAME,
      password: DB_PASSWORD,
      database: DB_DATABASE,
      synchronize: false,
      logging: true,
      entities: [path.join(__dirname, '../entity/**/*.{ts,js}')],
      migrations: [path.join(__dirname, '../migrations/*.{ts,js}')],
      subscribers: [],
      charset: 'utf8mb4_unicode_ci',
      driver: mysql2,
    });

    AppDataSource = source;

    return source;
  } catch (err) {
    console.error(err);
  }
})();
