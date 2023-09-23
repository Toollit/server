import { NextFunction, Request, Response } from 'express';

/** login check middleware */

/**
 * Only logged-in user can access
 * */
const isLoggedIn = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    next();
  } else {
    res.status(500).json({
      success: false,
      message: '로그인이 후 이용 가능합니다.',
    });
  }
};

/**
 * Only non-logged users can access it.
 * */
const isNotLoggedIn = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    next();
  } else {
    res.status(500).json({
      success: false,
      message: '비정상적인 접근입니다.',
    });
  }
};

export { isLoggedIn, isNotLoggedIn };
