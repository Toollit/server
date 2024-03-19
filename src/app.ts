import 'reflect-metadata';
import './config/dotenvConfig';
import express, { Application, Request, Response, NextFunction } from 'express';
import authRouter from './routes/auth/index';
import userRouter from './routes/user/index';
import postRouter from './routes/post/index';
import searchRouter from './routes/search/index';
import { dataSource } from './config/data-source';
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
import { getParameterStore } from '@/utils/awsParamterStore';
import { redisClient } from './utils/redisClient';

const app = async () => {
  const ORIGIN_URL = await getParameterStore({ key: 'ORIGIN_URL' });
  const COOKIE_SECRET = await getParameterStore({ key: 'COOKIE_SECRET' });

  const app: Application = express();
  const port = 4000;

  // redis connection settings
  const redis = await redisClient;
  redis.on('connect', () => {
    console.info('Redis connected!');
  });
  redis.on('error', (err) => {
    console.error('Redis Client Error', err);
  });

  await redis.connect();

  // passport settings
  passportStrategy();

  // typeorm connection with database
  dataSource()
    .then((db) => {
      db.initialize();
      console.log('Data Source has been initialized!');
    })
    .catch((err) =>
      console.error('Error during Data Source initialization:', err)
    );

  app.use(
    cors({
      origin: ORIGIN_URL,
      credentials: true,
    })
  );

  app.use(helmet());
  app.use(compression());
  app.use(hpp());
  app.use(logger);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser(COOKIE_SECRET));
  app.use(
    session({
      secret: COOKIE_SECRET,
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
    console.log(`started server on 0.0.0.0:${port}, url: ${ORIGIN_URL}`);
  });
};

app();
