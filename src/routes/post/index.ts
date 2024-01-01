import express from 'express';
import bookmarkRouter from './bookmark';
import projectsRouter from './projects';
import projectRouter from './project';
import reportRouter from './report';

const router = express.Router();

router.use('/bookmark', bookmarkRouter);
router.use('/projects', projectsRouter);
router.use('/project', projectRouter);
router.use('/report', reportRouter);

export default router;
