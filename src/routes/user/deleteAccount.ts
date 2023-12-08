import { AppDataSource } from '@/data-source';
import { CLIENT_ERROR_ABNORMAL_ACCESS } from '@/message/error';
import { isLoggedIn } from '@/middleware/loginCheck';
import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import { v4 as uuidV4 } from 'uuid';
import { DeleteAccountRequest } from '@/entity/deleteAccountRequest';

dotenv.config();

const ORIGIN_URL = process.env.ORIGIN_URL;
const GETIT_LOGO_IMAGE_URL = process.env.GETIT_LOGO_IMAGE_URL;

const router = express.Router();

// Sending delete user account confirmation email router
router.post(
  '/',
  isLoggedIn,
  async (req: Request, res: Response, next: NextFunction) => {
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_ABNORMAL_ACCESS,
      });
    }
    const email = currentUser.email;
    const a1 = uuidV4();
    const a2 = uuidV4();
    const a3 = uuidV4();

    const authCodeQuery = `?email=${email}&a1=${a1}&a2=${a2}&a3=${a3}`;
    const deleteAccountConfirmPage = '/deleteAccount/confirm';
    const deleteAccountConfirmURL =
      ORIGIN_URL + deleteAccountConfirmPage + authCodeQuery;

    try {
      const isExistDeleteAccountRequest = await AppDataSource.getRepository(
        DeleteAccountRequest
      )
        .createQueryBuilder()
        .where('email = :email', { email })
        .getOne();

      if (isExistDeleteAccountRequest) {
        await AppDataSource.createQueryBuilder()
          .update(DeleteAccountRequest)
          .set({ email, a1, a2, a3 })
          .where('email = :email', { email })
          .execute();
      }

      if (!isExistDeleteAccountRequest) {
        await AppDataSource.createQueryBuilder()
          .insert()
          .into(DeleteAccountRequest)
          .values({ email, a1, a2, a3 })
          .execute();
      }
    } catch (err) {
      return next(err);
    }

    let emailTemplate;

    const appDir = path
      .resolve(__dirname)
      .replace('routes/user', '/template/deleteAccountConfirmMail.ejs');

    ejs.renderFile(
      appDir,
      {
        getitLogo: GETIT_LOGO_IMAGE_URL,
        getitURL: ORIGIN_URL,
        deleteAccountConfirmURL,
      },
      function (err, data) {
        if (err) {
          return next(err);
        }
        emailTemplate = data;
      }
    );

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
      to: email,
      subject: 'Getit 회원 탈퇴 확인 메일입니다.',
      html: emailTemplate,
    };

    transporter.sendMail(mailOptions, function (err, info) {
      if (err) {
        transporter.close();
        return next(err);
      }
      console.log(
        `[${info.accepted}] - finish sending email : ` + info.response
      );

      return res.status(200).json({
        success: true,
        message: null,
      });
    });
  }
);

export default router;
