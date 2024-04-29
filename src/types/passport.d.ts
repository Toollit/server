type PassportLocalError = Error | null;

type PassportLocalUser = UserData | false;

type PassportLocalInfo = { message: string } | null;

export { PassportLocalError, PassportLocalUser, PassportLocalInfo };
