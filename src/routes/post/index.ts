import express from 'express';
import projectsRouter from './projects';
import projectRouter from './project';
import reportRouter from './report';

const router = express.Router();

router.use('/projects', projectsRouter);
router.use('/project', projectRouter);
router.use('/report', reportRouter);

export default router;
