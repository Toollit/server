import { UserData } from '@/types/user';
import { Response } from 'express';

declare global {
  namespace Express {
    interface User extends UserData {}
  }
}
interface ResponseJson {
  success: boolean;
  message: string | null;
  data?: any;
}

export interface CustomResponse extends Response<ResponseJson> {}
