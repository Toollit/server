import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './User';

@Entity()
export class Bookmark {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bookmarkProjectId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null = null;

  @ManyToOne(() => User, (user) => user.bookmarks)
  user: User;
}
