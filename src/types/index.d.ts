import { UserData } from '../entity/types';

declare global {
  namespace Express {
    interface User extends UserData {}
  }
}
