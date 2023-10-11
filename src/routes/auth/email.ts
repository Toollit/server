import express, { Request, Response, NextFunction } from 'express';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import { AppDataSource } from '@/data-source';
import { User } from '@/entity/User';
import {
  CLIENT_ERROR_EXIST_EMAIL,
  CLIENT_ERROR_MISMATCH_AUTH_CODE,
  CLIENT_ERROR_EXPIRE_AUTH_TIME,
} from '@/message/error';

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_CLOUD,
  legacyMode: true,
});

redisClient.on('connect', () => {
  console.info('Redis connected!');
});
redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

(async () => {
  await redisClient.connect();
})();

const router = express.Router();

interface EmailAuthCodeReqBody {
  email: string;
}

router.post(
  '/issueAuthCode',
  async (
    req: Request<{}, {}, EmailAuthCodeReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const userEmail = req.body.email;

    const userRepository = AppDataSource.getRepository(User);

    try {
      const isExistedEmail = await userRepository.findOne({
        where: {
          email: userEmail,
        },
      });

      if (isExistedEmail) {
        return res.status(409).json({
          success: false,
          message: CLIENT_ERROR_EXIST_EMAIL,
        });
      }
    } catch (error) {
      return next(error);
    }

    const authCode = Math.random().toString().slice(2, 8);

    let emailTemplate;

    const appDir = path
      .resolve(__dirname)
      .replace('routes/auth', '/template/authMail.ejs');

    ejs.renderFile(appDir, { authCode }, function (err, data) {
      if (err) {
        return next(err);
      }
      emailTemplate = data;
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.NODEMAILER_USER,
        pass: process.env.NODEMAILER_PASS,
      },
    });

    const mailOptions = {
      from: `Getit <${process.env.NODEMAILER_USER}>`,
      to: userEmail,
      subject: 'Getit 회원가입을 위한 인증번호를 입력해주세요.',
      html: emailTemplate,
    };

    transporter.sendMail(mailOptions, async function (error, info) {
      if (error) {
        transporter.close();
        return next(error);
      }
      console.log(
        `[${info.accepted}] - finish sending email : ` + info.response
      );

      try {
        // save authCode to redis. redis cache expires in 5 minutes
        await redisClient.v4.set(userEmail, authCode, { EX: 60 * 5 });

        return res.status(200).json({
          success: true,
          message: null,
        });
      } catch (error) {
        return next(error);
      } finally {
        return transporter.close();
      }
    });
  }
);

interface AuthCodeReqBody {
  email: string;
  authCode: string;
}

router.post(
  '/verify',
  async (
    req: Request<{}, {}, AuthCodeReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const { email, authCode } = req.body;

    try {
      const redisAuthCode = await redisClient.v4.get(email);

      if (redisAuthCode === null) {
        return res.status(401).json({
          success: false,
          message: CLIENT_ERROR_EXPIRE_AUTH_TIME,
        });
      }

      if (authCode === redisAuthCode) {
        return res.status(200).json({
          success: true,
          message: null,
        });
      }

      if (authCode !== redisAuthCode) {
        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_MISMATCH_AUTH_CODE,
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
