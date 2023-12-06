import { NextFunction, Request, Response } from 'express';
import {
  CLIENT_ERROR_ABNORMAL_ACCESS,
  CLIENT_ERROR_LOGIN_REQUIRED,
} from '@/message/error';

/** login check middleware */

/**
 * Only logged-in user can access
 * */
const isLoggedIn = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  } else {
    return res.status(401).json({
      success: false,
      message: CLIENT_ERROR_LOGIN_REQUIRED,
    });
  }
};

/**
 * Only non-logged users can access it.
 * */
const isNotLoggedIn = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return next();
  } else {
    return res.status(401).json({
      success: false,
      message: CLIENT_ERROR_ABNORMAL_ACCESS,
    });
  }
};

export { isLoggedIn, isNotLoggedIn };
