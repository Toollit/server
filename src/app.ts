import 'reflect-metadata';
import express, { Application, Request, Response, NextFunction } from 'express';
import postRouter from './routes/post';
import userRouter from './routes/user';
import { AppDataSource } from './data-source';
import dotenv from 'dotenv';
import cors from 'cors';
dotenv.config();

const app: Application = express();
const port = 4000;

app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// typeorm connection with database
AppDataSource.initialize()
  .then(() => {
    console.log('Data Source has been initialized!');
  })
  .catch((error) =>
    console.error('Error during Data Source initialization:', error)
  );

app.get('/', (req: Request, res: Response, next: NextFunction) => {
  res.send('Hello World!');
});

app.use('/post', postRouter);
app.use('/user', userRouter);

app.listen(port, () => {
  console.log(
    `started server on 0.0.0.0:${port}, url: http://localhost:${port}`
  );
});
