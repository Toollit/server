import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';
import crypto from 'crypto';
import { Buffer } from 'buffer';

const router = express.Router();

router.post('/login', async (req: Request, res: Response) => {
  console.log(req.body);

  const { email, password, channel } = req.body;

  const user = new User();
  user.email = email;

  const userRepository = AppDataSource.getRepository(User);

  const result = await userRepository.findOne({
    where: {
      email,
      password,
    },
  });

  if (!result) {
    return res
      .status(401)
      .json({ success: false, message: 'invalid email or password' });
  }

  res.status(200).json({ success: true, message: null });
});

router.post('/signup', function (req, res, next) {
  const { email, password, signupType } = req.body;

  let salt = crypto.randomBytes(16);
  crypto.pbkdf2(
    password,
    salt,
    310000,
    32,
    'sha256',
    async function (err, hashedPassword) {
      if (err) {
        return next(err);
      }

      const userRepository = AppDataSource.getRepository(User);
      const isExistedEmail = await userRepository.findOne({
        where: {
          email,
        },
      });

      if (isExistedEmail) {
        return res.status(400).json({
          success: false,
          message: '가입되어있는 이메일 입니다.',
        });
      }

      const hashedBuffer = Buffer.from(hashedPassword);
      const hashedString = hashedBuffer.toString('hex');

      const user = new User();
      user.email = email;
      user.password = hashedString;
      user.signupType = signupType;

      try {
        const result = await userRepository.save(user);

        if (result) {
          return res.status(201).json({
            success: true,
            message: 'signup success',
          });
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'signup error',
          errorCode: error,
        });
      }
    }
  );
});

export default router;
