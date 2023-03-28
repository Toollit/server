import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { PostImage } from './PostImage';
import { User } from './User';

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  title: string;

  // 컨텐츠 보여주기용
  @Column({ type: 'text' })
  contentHTML: string;

  // 작성자 수정용
  @Column({ type: 'text' })
  contentMarkdown: string;

  @Column({ default: true })
  views: number = 1;

  @Column({ default: true })
  edit: boolean = false;

  @Column({ nullable: true })
  updatedAt?: Date;

  @Column({ default: () => 'NOW()' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.posts)
  user: User;

  @OneToMany(() => PostImage, (postImage) => postImage.post)
  images: PostImage[];
}
