import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Report {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  postType: string;

  @Column()
  postId: number;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column()
  writerId: number;

  @Column()
  writerNickname: string;

  @Column()
  reporterId: number;

  @Column()
  reporterNickname: string;

  @Column()
  reason: string;

  @Column()
  url: string;

  @Column({ default: 'pending' })
  resolved: 'pending' | 'fulfilled';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;
}
