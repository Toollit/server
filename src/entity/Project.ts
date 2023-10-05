import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { ProjectContentImage } from './ProjectContentImage';
import { User } from './User';
import { Hashtag } from './Hashtag';
import { Comment } from './Comment';
import { MemberType } from './MemberType';
import { ProjectMember } from './ProjectMember';

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  title: string;

  // use contentHTML column data when displaying content
  @Column({ type: 'text' })
  contentHTML: string;

  // use contentMarkdown column data when modifying content
  @Column({ type: 'text' })
  contentMarkdown: string;

  @Column({ default: 0 })
  views: number;

  @Column({ default: 0 })
  bookmarks: number;

  @Column({ default: 0 })
  memberNumber: number;

  @Column({ default: 0 })
  recruitNumber: number;

  @Column()
  representativeImage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;

  @ManyToOne(() => User, (user) => user.projects)
  user: User;

  @OneToMany(
    () => ProjectContentImage,
    (ProjectContentImage) => ProjectContentImage.project
  )
  images: ProjectContentImage[];

  @OneToMany(() => Hashtag, (hashtag) => hashtag.project)
  hashtags: Hashtag[];

  @OneToMany(() => Comment, (comment) => comment.project)
  comments: Comment[];

  @OneToMany(() => MemberType, (memberType) => memberType.project)
  memberTypes: MemberType[];

  @OneToMany(() => ProjectMember, (projectMember) => projectMember.project)
  members: ProjectMember[];
}
