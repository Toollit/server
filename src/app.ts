import 'reflect-metadata';
import express, { Application, Request, Response, NextFunction } from 'express';
import postRouter from './routes/post';
import userRouter from './routes/user';
import authRouter from './routes/auth';
import { AppDataSource } from './data-source';
import dotenv from 'dotenv';
import cors from 'cors';
import passport from 'passport';
import logger from 'morgan';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passportStrategy from './passport/authStrategy';

dotenv.config();

const app: Application = express();
const port = 4000;

app.use(
  cors({
    origin: process.env.ORIGIN_URL,
    credentials: true,
  })
);

passportStrategy();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(
  session({
    secret: process.env.COOKIE_SECRET as string,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

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
app.use('/auth', authRouter);

app.listen(port, () => {
  console.log(
    `started server on 0.0.0.0:${port}, url: http://localhost:${port}`
  );
});
