import { NextFunction, Request, Response } from 'express';
import {
  CLIENT_ERROR_ABNORMAL_ACCESS,
  CLIENT_ERROR_LOGIN_REQUIRED,
} from '@/message/error';

/** signed in check middleware */

/**
 * Only signed in user can access
 * */
const isSignedIn = (req: Request, res: Response, next: NextFunction) => {
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
 * Only non signed users can access
 * */
const isNotSignedIn = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return next();
  } else {
    return res.status(401).json({
      success: false,
      message: CLIENT_ERROR_ABNORMAL_ACCESS,
    });
  }
};

export { isSignedIn, isNotSignedIn };
