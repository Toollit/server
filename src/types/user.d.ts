export interface UserData {
  id: number;
  role: number;
  email: string;
  password: string;
  tempPassword: string;
  salt: string;
  signupType: 'email' | 'google' | 'github';
  nickname: string;
  signinFailedCount: number;
  lastSigninAt: Date;
  createdAt: Date;
  updatedAt: Date | null;
}
