import express, { Request, NextFunction } from 'express';
import { CustomResponse } from '@/types';
import { AppDataSource } from '@/config/data-source';
import { User } from '@/entity/User';
import { isSignedIn } from '@/middleware/signinCheck';
import {
  CLIENT_ERROR_NICKNAME_ALREADY_EXIST,
  CLIENT_ERROR_NICKNAME_LENGTH_TWO_TO_TWENTY,
  CLIENT_ERROR_NICKNAME_ONLY_NO_SPACE_ENGLISH_NUMBER,
} from '@/message/error';

const router = express.Router();

interface DuplicateNicknameCheckReqQuery {
  [key: string]: string;
  nickname: string;
}

// User nickname duplicate check router
router.get(
  '/',
  isSignedIn,
  async (
    req: Request<{}, {}, {}, DuplicateNicknameCheckReqQuery>,
    res: CustomResponse,
    next: NextFunction
  ) => {
    const { nickname } = req.query;

    const onlyEnglishNumber = /^[a-zA-Z0-9]+$/;

    const isOnlyEnglishNumber = onlyEnglishNumber.test(nickname);

    if (!isOnlyEnglishNumber) {
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_NICKNAME_ONLY_NO_SPACE_ENGLISH_NUMBER,
      });
    }

    if (nickname.length < 2 || nickname.length > 20) {
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_NICKNAME_LENGTH_TWO_TO_TWENTY,
      });
    }

    const userRepository = AppDataSource.getRepository(User);

    try {
      const isExistNickname = await userRepository.findOne({
        where: { nickname },
      });

      if (isExistNickname) {
        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_NICKNAME_ALREADY_EXIST,
        });
      } else {
        return res.status(200).json({
          success: true,
          message: null,
        });
      }
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
