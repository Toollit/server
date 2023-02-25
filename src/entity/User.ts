import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Post } from './Post';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 200 })
  email: string;

  @Column({ nullable: true, length: 100 })
  password: string;

  @Column()
  signupType: 'google' | 'github' | 'email';

  @Column({ nullable: true, length: 20 })
  nickname: string;

  @Column({ nullable: true, length: 20 })
  username: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @OneToMany(() => Post, (post) => post.user)
  posts: Post[];
}
