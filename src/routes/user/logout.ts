import express from 'express';

const router = express.Router();

// user logout router
router.post('/', function (req, res, next) {
  return req.logout(function (err) {
    if (err) {
      return next(err);
    }

    return res.status(200).json({
      success: true,
      message: null,
    });
  });
});

export default router;
