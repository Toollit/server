import express, { Request, Response, NextFunction } from 'express';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import { createClient } from 'redis';
import { AppDataSource } from '@/config/data-source';
import { User } from '@/entity/User';
import {
  CLIENT_ERROR_EXIST_EMAIL,
  CLIENT_ERROR_MISMATCH_AUTH_CODE,
  CLIENT_ERROR_EXPIRE_AUTH_TIME,
} from '@/message/error';

const ORIGIN_URL = process.env.ORIGIN_URL;
const AWS_S3_TOOLLIT_LOGO_IMAGE_URL = process.env.AWS_S3_TOOLLIT_LOGO_IMAGE_URL;
const HIWORKS_EMAIL_USER = process.env.HIWORKS_EMAIL_USER;
const HIWORKS_EMAIL_PASS = process.env.HIWORKS_EMAIL_PASS;

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

interface IssueAuthCodeReqBody {
  email: string;
}

// Issue authentication code upon sign up
router.post(
  '/issueAuthCode',
  async (
    req: Request<{}, {}, IssueAuthCodeReqBody>,
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
    } catch (err) {
      return next(err);
    }

    const authCode = Math.random().toString().slice(2, 8);

    let emailTemplate;

    const appDir = path
      .resolve(__dirname)
      .replace('routes/auth', '/template/authMail.ejs');

    ejs.renderFile(
      appDir,
      {
        authCode,
        toollitLogo: AWS_S3_TOOLLIT_LOGO_IMAGE_URL,
        toollitURL: ORIGIN_URL,
      },
      function (err, data) {
        if (err) {
          return next(err);
        }
        emailTemplate = data;
      }
    );

    const transporter = nodemailer.createTransport({
      service: 'hiworks',
      host: 'smtps.hiworks.com',
      port: 465,
      secure: true,
      auth: {
        user: HIWORKS_EMAIL_USER,
        pass: HIWORKS_EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: 'Toollit <no-reply@toollit.com>',
      to: userEmail,
      subject: 'Toollit 회원가입을 위한 인증번호를 입력해주세요.',
      html: emailTemplate,
    };

    transporter.sendMail(mailOptions, async function (err, info) {
      if (err) {
        transporter.close();
        return next(err);
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
      } catch (err) {
        return next(err);
      } finally {
        return transporter.close();
      }
    });
  }
);

interface VerifyAuthCodeReqBody {
  email: string;
  authCode: string;
}

// Check auth code sent to verify email when sign up.
router.post(
  '/verify',
  async (
    req: Request<{}, {}, VerifyAuthCodeReqBody>,
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
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
