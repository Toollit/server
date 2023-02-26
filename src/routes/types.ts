interface UserData {
  id: number;
  email: string;
  password: string;
  salt: string;
  signupType: 'email' | 'google' | 'github';
  nickname: string | null;
  username: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}
type PassportLocalError = Error | null;

type PassportLocalUser = UserData | boolean;

type PassportLocalInfo = { message: string } | null;

export { PassportLocalError, PassportLocalUser, PassportLocalInfo };
