// # Client error responses status code 400 ~ 499
export const CLIENT_ERROR_DEFAULT =
  '잘못된 요청입니다. 잠시 후 다시 시도해 주세요.';

export const CLIENT_ERROR_LOGIN_REQUIRED = '로그인 후 이용 가능합니다.';

export const CLIENT_ERROR_ABNORMAL_ACCESS = '비정상적인 접근입니다.';

export const CLIENT_ERROR_MISMATCH_EMAIL_PASSWORD =
  '이메일 또는 비밀번호가 일치하지 않습니다.';

export const CLIENT_ERROR_EXIST_SIGNUP_SOCIAL_LOGIN =
  '소셜 로그인을 통해 가입이 이루어진 계정입니다.';

export const CLIENT_ERROR_LOGIN_LIMIT =
  '로그인 5회 연속 오류로 서비스 이용이 불가합니다.\n(*고객센터 - 공지사항 - 비밀번호 5회 연속 오류 공지 확인)';

export const CLIENT_ERROR_LOGIN_FAILED_COUNT =
  '비밀번호가 일치하지 않습니다.\n5회 이상 오류시 서비스 이용이 제한됩니다.\n(누적오류입력 {loginFailedCount}회)';

export const CLIENT_ERROR_EXIST_EMAIL = '가입되어있는 이메일 입니다.';

export const CLIENT_ERROR_MISMATCH_AUTH_CODE = '인증번호가 일치하지 않습니다.';

export const CLIENT_ERROR_NOT_FOUND = '404 Not Found';

export const CLIENT_ERROR_EXPIRE_AUTH_TIME = '인증시간이 만료되었습니다.';

export const CLIENT_ERROR_WRITTEN_BY_ME = '내가 작성한 게시글 입니다.';

export const CLIENT_ERROR_MEMBER_OF_PROJECT = '참여 중인 프로젝트입니다.';

export const CLIENT_ERROR_EXIST_REPORT = '이미 신고한 게시글 입니다.';

export const CLIENT_ERROR_NICKNAME_ONLY_NO_SPACE_ENGLISH_NUMBER =
  '닉네임은 영어, 숫자 조합으로만 가능합니다. 공백 불가.';

export const CLIENT_ERROR_NICKNAME_LENGTH_TWO_TO_TWENTY =
  '닉네임은 2자 이상 20자 이하까지 가능합니다.';

export const CLIENT_ERROR_NICKNAME_ALREADY_EXIST =
  '이미 존재하는 닉네임입니다. 다른 닉네임을 입력해 주세요.';

export const CLIENT_ERROR_NOT_EXIST_USER = '존재하지 않는 유저 입니다.';

export const CLIENT_ERROR_INTRODUCE_LENGTH_LIMIT =
  '자기소개는 {lengthLimit}자 이하여야 합니다.';

export const CLIENT_ERROR_NOT_EXIST_EMAIL =
  '가입된 이메일 정보가 존재하지 않습니다.';

export const CLIENT_ERROR_SAME_PASSWORD_IMPOSSIBLE =
  '이전과 동일한 비밀번호로 변경할 수 없습니다.';

// # Server error responses status code 500 ~
export const SERVER_ERROR_DEFAULT =
  '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
