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
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date | null;
}
