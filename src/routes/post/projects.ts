import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { Project } from '@/entity/Project';
import { User } from '@/entity/User';
import { Bookmark } from '@/entity/Bookmark';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// API to look up all projects. Using Pagination.
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const page = Number(req.query.page);
  const order = req.query.order as 'new' | 'popularity';

  const postsPerPage = 12;

  const skip = (page - 1) * postsPerPage;

  const projectRepository = AppDataSource.getRepository(Project);
  const bookmarkRepository = AppDataSource.getRepository(Bookmark);

  try {
    const projects = await projectRepository.find({
      relations: { hashtags: true, memberTypes: true },
      order: order === 'new' ? { id: 'DESC' } : { views: 'DESC' },
      skip: page >= 2 ? skip : 0,
      take: postsPerPage,
    });

    const projectsTotalCount = await projectRepository
      .createQueryBuilder('projects')
      .getCount();

    const totalPage = Math.ceil(projectsTotalCount / postsPerPage);

    const processedData = await Promise.all(
      projects.map(async (project) => {
        const processedHashtagsData = project.hashtags.map(
          (hashtag) => hashtag.tagName
        );

        const processedMemberTypesData = project.memberTypes.map(
          (memberType) => memberType.type
        );

        // developer, designer, pm, anyone 순으로 정렬
        processedMemberTypesData.sort(function (a, b) {
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
            bookmarkProjectId: project.id,
          },
        });

        return {
          id: project.id,
          title: project.title,
          views: project.views,
          bookmarks: bookmarks.length,
          hashtags: processedHashtagsData,
          memberTypes: processedMemberTypesData,
          memberNumber: project.memberNumber,
          recruitNumber: project.recruitNumber,
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
  } catch (error) {
    next(error);
  }
});

// API to check bookmark status of all posts
router.get(
  '/bookmarkStatus',
  async (req: Request, res: Response, next: NextFunction) => {
    const requestUser = req.user;

    if (!requestUser) {
      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarks: null,
        },
      });
    }

    const userRepository = AppDataSource.getRepository(User);

    try {
      const userInfoWithBookmarks = await userRepository.findOne({
        where: { id: requestUser.id },
        relations: { bookmarks: true },
      });

      const bookmarks = userInfoWithBookmarks?.bookmarks;

      if (!bookmarks) {
        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmarks: null,
          },
        });
      }

      const hashBookmark = bookmarks.length >= 1;

      const bookmarkIds = bookmarks.map(
        (bookmark) => bookmark.bookmarkProjectId
      );

      if (hashBookmark) {
        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmarks: bookmarkIds,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarks: null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
