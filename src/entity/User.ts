import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Post } from './Post';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  email: string;

  @Column({ unique: true, nullable: true })
  google?: string;

  @Column({ length: 10 })
  nickname: string;

  @Column({ length: 200 })
  password: string;

  @Column({ default: () => 'NOW()' })
  createdAt: Date;

  @OneToMany(() => Post, (post) => post.user)
  posts: Post[];
}
