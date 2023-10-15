import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { User } from '@/entity/User';
import { isLoggedIn } from '@/middleware/loginCheck';
import {
  CLIENT_ERROR_NICKNAME_ALREADY_EXIST,
  CLIENT_ERROR_NICKNAME_LENGTH_TWO_TO_TWENTY,
  CLIENT_ERROR_NICKNAME_ONLY_NO_SPACE_ENGLISH_NUMBER,
} from '@/message/error';

const router = express.Router();

interface RequestBody {
  nickname: string;
}

// user nickname duplicate check router
router.post(
  '/',
  isLoggedIn,
  async (
    req: Request<{}, {}, RequestBody>,
    res: Response,
    next: NextFunction
  ) => {
    const { nickname } = req.body;

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
  }
);

export default router;
