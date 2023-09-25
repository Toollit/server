export interface UserData {
  id: number;
  role: number;
  email: string;
  password: string;
  tempPassword: string;
  salt: string;
  signUpType: 'email' | 'google' | 'github';
  nickname: string;
  loginFailedCount: number;
  createdAt: Date;
  updatedAt: Date | null;
  lastLoginAt: Date | null;
}
type PassportLocalError = Error | null;

type PassportLocalUser = UserData | false;

type PassportLocalInfo = { message: string } | null;

export { PassportLocalError, PassportLocalUser, PassportLocalInfo };
