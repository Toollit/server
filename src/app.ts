import 'reflect-metadata';
import './config/dotenvConfig';
import express, { Application, Request, Response, NextFunction } from 'express';
import authRouter from './routes/auth/index';
import userRouter from './routes/user/index';
import postRouter from './routes/post/index';
import searchRouter from './routes/search/index';
import { AppDataSource } from './config/data-source';
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
import { getParameterStore } from './utils/awsParameterStore';
import { redisClient } from './utils/redisClient';

const app = async () => {
  const isDev = process.env.NODE_ENV === 'development';
  const ORIGIN_URL = await getParameterStore({ key: 'ORIGIN_URL' }).catch(
    (err) => {
      throw new Error(`aws getParameterStore ORIGIN_URL fetch error: ${err}`);
    }
  );
  const COOKIE_SECRET = await getParameterStore({ key: 'COOKIE_SECRET' }).catch(
    (err) => {
      throw new Error(
        `aws getParameterStore COOKIE_SECRET fetch error: ${err}`
      );
    }
  );

  const app: Application = express();
  const port = 4000;

  // redis connection settings
  const redis = await redisClient.catch((err) => {
    throw new Error(`redis client create error: ${err}`);
  });
  redis.on('connect', () => {
    console.info('Redis connected!');
  });
  redis.on('error', (err) => {
    console.error('Redis Client Error', err);
  });

  await redis.connect().catch((err) => {
    throw new Error(`redis client connect error: ${err}`);
  });

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

  if (!isDev) {
    app.set('trust proxy', 1);
  }

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

  if (!isDev) {
    app.use(
      session({
        secret: COOKIE_SECRET,
        resave: false,
        saveUninitialized: false,
        proxy: true,
        cookie: {
          httpOnly: true,
          secure: true,
          domain: isDev ? undefined : '.toollit.com',
        },
      })
    );
  }

  if (isDev) {
    app.use(
      session({
        secret: COOKIE_SECRET,
        resave: false,
        saveUninitialized: false,
      })
    );
  }

  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/', (req: Request, res: Response, next: NextFunction) => {
    res.send('toollit server is available now.');
  });

  app.use('/api/auth', authRouter);
  app.use('/api/user', userRouter);
  app.use('/api/post', postRouter);
  app.use('/api/search', searchRouter);

  app.use(errorHandler);

  app.listen(port, () => {
    console.log(`started server on 0.0.0.0:${port}`);
  });
};

app();
