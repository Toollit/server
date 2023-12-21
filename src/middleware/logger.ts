import morgan from 'morgan';
import { winstonLogger } from './winston';

const format = () => {
  const result = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  return result;
};

// Forwarding morgan log information to winston logger via stream
const stream = {
  write: (message: string) => {
    const removeAnsiEscapeCodesRegex =
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

    const statusCodeIndex = format() === 'combined' ? 8 : 2;
    const statusCode = Number(
      message.replace(removeAnsiEscapeCodesRegex, '').split(' ')[
        statusCodeIndex
      ]
    );

    if (statusCode >= 400) {
      return winstonLogger.error(
        decodeURIComponent(message.replace(removeAnsiEscapeCodesRegex, ''))
      );
    } else {
      return winstonLogger.info(
        decodeURIComponent(message.replace(removeAnsiEscapeCodesRegex, ''))
      );
    }
  },
};

const logger = morgan(format(), { stream });

export { logger };
