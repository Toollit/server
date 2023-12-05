import winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';
import process from 'process';

// Logging levels
// error: 0,
// warn: 1,
// info: 2,
// http: 3,
// verbose: 4,
// debug: 5,
// silly: 6

const { combine, timestamp, label, printf } = winston.format;

// Log file storage path
const logDir = `${process.cwd()}/logs`;

/**
 * Log Save Format
 * timestamp come from format: combine() method inside data.
 * level is automatically delivered from the combine method.
 * message is logger error or info method arguments string.
 */
const logFormat = printf(({ timestamp, level, message }) => {
  return `${timestamp} [${level}] ${message}`;
});

const winstonLogger = winston.createLogger({
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    label({ label: 'winston' }),
    logFormat
  ),
  // Define how logs were recorded.
  transports: [
    // Info level log file settings
    new winstonDaily({
      level: 'info',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir,
      filename: `%DATE%.log`,
      maxFiles: 30,
      zippedArchive: true,
    }),
    // Error level log file settings
    new winstonDaily({
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir + '/error',
      filename: `%DATE%.error.log`,
      maxFiles: 30,
      zippedArchive: true,
    }),
  ],
  //* UncaughtException log file settings
  exceptionHandlers: [
    new winstonDaily({
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir + '/exception',
      filename: `%DATE%.exception.log`,
      maxFiles: 30,
      zippedArchive: true,
    }),
  ],
});

// Allow logs to be visible to terminal in the development environment. log file is still created
if (process.env.NODE_ENV !== 'production') {
  winstonLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // log level color
        winston.format.simple() // log simple format for terminal logging
      ),
    })
  );
}

export { winstonLogger };
