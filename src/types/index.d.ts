import { UserData } from '@/types/user';

declare global {
  namespace Express {
    interface User extends UserData {}
  }
}
