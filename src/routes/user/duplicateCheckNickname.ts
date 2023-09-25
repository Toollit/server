import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { User } from '@/entity/User';

const router = express.Router();

interface RequestBody {
  nickname: string;
}

// user nickname duplicate check router
router.post(
  '/',
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
        message: '닉네임은 영어, 숫자 조합으로만 가능합니다.',
      });
    }

    if (nickname.length > 20) {
      return res.status(400).json({
        success: false,
        message: '닉네임은 최대 20자까지 가능합니다.',
      });
    }

    const userRepository = AppDataSource.getRepository(User);

    const isExistNickname = await userRepository.findOne({
      where: { nickname },
    });

    if (isExistNickname) {
      return res.status(400).json({
        success: false,
        message: '이미 존재하는 닉네임입니다. 다른 닉네임을 입력해 주세요.',
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
