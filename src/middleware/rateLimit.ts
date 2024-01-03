import { rateLimit } from 'express-rate-limit';

export const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  limit: 20, // Limit each IP to 200 requests per `window` (here, per 1 minutes).
  standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  // store: ... , // Use an external store for consistency across multiple server instances.
  message: 'Too Many Requests',
  handler: (req, res, next) => {
    res.status(429).json({
      success: false,
      message:
        'Too many requests are being sent, please try again in a moment.',
    });
  },
});
