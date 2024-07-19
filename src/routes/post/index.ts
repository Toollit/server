import express from 'express';
import bookmarkRouter from './bookmark';
import projectOverviewsRouter from './projectOverviews';
import projectRouter from './project';
import reportRouter from './report';

const router = express.Router();

router.use('/bookmark', bookmarkRouter);
router.use('/projectOverviews', projectOverviewsRouter);
router.use('/project', projectRouter);
router.use('/report', reportRouter);

export default router;
