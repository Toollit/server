import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { Project } from '@/entity/Project';
import { Bookmark } from '@/entity/Bookmark';

const router = express.Router();

interface ProjectReqQuery {
  page: string;
  order: 'new' | 'popularity';
}

// Look up all projects with using pagination router
router.get(
  '/',
  async (
    req: Request<{}, {}, {}, ProjectReqQuery>,
    res: Response,
    next: NextFunction
  ) => {
    const page = Number(req.query.page);
    const order = req.query.order;

    const postsPerPage = 12;

    const skip = (page - 1) * postsPerPage;

    const projectRepository = AppDataSource.getRepository(Project);
    const bookmarkRepository = AppDataSource.getRepository(Bookmark);

    try {
      const projects = await projectRepository.find({
        relations: { hashtags: true, memberTypes: true, members: true },
        order: order === 'new' ? { id: 'DESC' } : { views: 'DESC' },
        skip: page >= 2 ? skip : 0,
        take: postsPerPage,
      });

      const projectTotalCount = await projectRepository
        .createQueryBuilder('projects')
        .getCount();

      const totalPage = Math.ceil(projectTotalCount / postsPerPage);

      const processedData = await Promise.all(
        projects.map(async (project) => {
          const extractTagNames = project.hashtags.map(
            (hashtag) => hashtag.tagName
          );

          const extractMemberTypes = project.memberTypes.map(
            (memberType) => memberType.type
          );

          // Sorts in order of developer, designer, pm, and anyone
          const orderedMemberTypes = extractMemberTypes.sort(function (a, b) {
            return (
              (a === 'developer'
                ? -3
                : a === 'designer'
                ? -2
                : a === 'pm'
                ? -1
                : a === 'anyone'
                ? 0
                : 1) -
              (b === 'developer'
                ? -3
                : b === 'designer'
                ? -2
                : b === 'pm'
                ? -1
                : b === 'anyone'
                ? 0
                : 1)
            );
          });

          const bookmarks = await bookmarkRepository.find({
            where: {
              projectId: project.id,
            },
          });

          const memberCount = project.members.length - 1; // -1 is to exclude project writer

          return {
            id: project.id,
            title: project.title,
            views: project.views,
            bookmarkCount: bookmarks.length,
            hashtags: extractTagNames,
            memberTypes: orderedMemberTypes,
            memberCount,
            recruitCount: project.recruitCount,
            representativeImage: project.representativeImage,
          };
        })
      );

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          projects: processedData,
          totalPage,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
