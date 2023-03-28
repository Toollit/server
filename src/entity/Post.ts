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

  @Column()
  views: number;

  @Column()
  edit: boolean;

  @Column({ default: null })
  updatedAt?: Date;

  @Column({ default: () => 'NOW()' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.posts)
  user: User;

  @OneToMany(() => PostImage, (postImage) => postImage.post)
  images: PostImage[];
}
