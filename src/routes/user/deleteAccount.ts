import express, { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '@/data-source';
import { isLoggedIn } from '@/middleware/loginCheck';
import nodemailer from 'nodemailer';
import path from 'path';
import { v4 as uuidV4 } from 'uuid';
import { DeleteAccountRequest } from '@/entity/deleteAccountRequest';
import { User } from '@/entity/User';
import { Profile } from '@/entity/Profile';
import ejs from 'ejs';
import dotenv from 'dotenv';
import {
  CLIENT_ERROR_ABNORMAL_ACCESS,
  CLIENT_ERROR_EXPIRE_TIME,
} from '@/message/error';
import { ProjectMember } from '@/entity/ProjectMember';

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const ORIGIN_URL = process.env.ORIGIN_URL;
const TOOLLIT_LOGO_IMAGE_URL = process.env.TOOLLIT_LOGO_IMAGE_URL;

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
        toollitLogo: TOOLLIT_LOGO_IMAGE_URL,
        toollitURL: ORIGIN_URL,
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
      from: `Toollit <${process.env.NODEMAILER_USER}>`,
      to: email,
      subject: 'Toollit 회원 탈퇴 확인 메일입니다.',
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

interface ConfirmDeleteAccountReqbody {
  email?: string;
  a1?: string;
  a2?: string;
  a3?: string;
}

// Confirm delete account router
router.post(
  '/confirm',
  async (
    req: Request<{}, {}, ConfirmDeleteAccountReqbody>,
    res: Response,
    next: NextFunction
  ) => {
    const { email, a1, a2, a3 } = req.body;

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Check the request has all the required values for authentication.
      if (!email || !a1 || !a2 || !a3) {
        await queryRunner.commitTransaction();

        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_ABNORMAL_ACCESS,
        });
      }

      // Check account deletion request info is exist.
      const isValidRequest = await queryRunner.manager
        .getRepository(DeleteAccountRequest)
        .createQueryBuilder()
        .where('email = :email', { email })
        .andWhere('a1 = :a1', { a1 })
        .andWhere('a2 = :a2', { a2 })
        .andWhere('a3 = :a3', { a3 })
        .getOne();

      // Request with invalid auth code.
      if (!isValidRequest) {
        await queryRunner.commitTransaction();

        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_ABNORMAL_ACCESS,
        });
      }

      const updatedAt = isValidRequest.updatedAt;
      const currentTime = new Date();

      if (!updatedAt) {
        throw new Error('Data updatedAt is not exist');
      }

      const differenceInMilliseconds =
        currentTime.getTime() - updatedAt.getTime();
      const tenMinutesInMilliseconds = 10 * 60 * 1000; // 10 minutes.

      if (differenceInMilliseconds >= tenMinutesInMilliseconds) {
        // Ten minutes have passed.

        await queryRunner.commitTransaction();

        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_EXPIRE_TIME,
        });
      } else {
        // Less than ten minutes had passed.
        // Delete account request info
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(DeleteAccountRequest)
          .where('email = :email', { email })
          .execute();

        const user = await queryRunner.manager
          .getRepository(User)
          .createQueryBuilder('user')
          .where('user.email = :email', { email })
          .leftJoinAndSelect('user.profile', 'profile')
          .getOne();

        if (!user) {
          throw new Error('User does not exist.');
        }

        const profile = await queryRunner.manager
          .getRepository(Profile)
          .createQueryBuilder()
          .where('id = :id', { id: user.profile.id })
          .getOne();

        if (!profile) {
          throw new Error('Profile does not exist.');
        }

        // TODO It is not urgent!! Relation resetting is required. User is not automatically deleted from the project member when the user is deleted account because the relationship with the user is not established
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(ProjectMember)
          .where('memberId = :memberId', { memberId: user.id })
          .execute();

        // Delete all user and related data except one to one relationship profile
        // Cascade not working one to one relation.
        // Github issue reference: https://github.com/typeorm/typeorm/issues/3218
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(User)
          .where('email = :email', { email })
          .execute();

        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Profile)
          .where('id = :id', { id: profile.id })
          .execute();

        await queryRunner.commitTransaction();

        return res.status(200).json({
          success: true,
          message: null,
        });
      }
    } catch (err) {
      await queryRunner.rollbackTransaction();
      return next(err);
    } finally {
      await queryRunner.release();
    }
  }
);

export default router;
