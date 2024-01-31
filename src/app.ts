import 'reflect-metadata';
import './dotenvConfig';
import express, { Application, Request, Response, NextFunction } from 'express';
import authRouter from './routes/auth/index';
import userRouter from './routes/user/index';
import postRouter from './routes/post/index';
import searchRouter from './routes/search/index';
import { AppDataSource } from './data-source';
import cors from 'cors';
import passport from 'passport';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passportStrategy from './passport/authStrategy';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import helmet from 'helmet';
import compression from 'compression';
import hpp from 'hpp';

const app: Application = express();
const port = 4000;

// passport settings
passportStrategy();

// typeorm connection with database
AppDataSource.initialize()
  .then(() => {
    console.log('Data Source has been initialized!');
  })
  .catch((error) =>
    console.error('Error during Data Source initialization:', error)
  );

app.use(
  cors({
    origin: process.env.ORIGIN_URL,
    credentials: true,
  })
);

app.use(helmet());
app.use(compression());
app.use(hpp());
app.use(logger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(
  session({
    secret: process.env.COOKIE_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req: Request, res: Response, next: NextFunction) => {
  res.send('Hello World!');
});

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/post', postRouter);
app.use('/api/search', searchRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(
    `started server on 0.0.0.0:${port}, url: ${process.env.ORIGIN_URL}`
  );
});
