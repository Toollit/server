import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './User';

@Entity()
export class Contact {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column()
  writerId: number;

  @Column({ default: 'pending' })
  resolved: 'pending' | 'fulfilled';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;

  @ManyToOne(() => User, (user) => user.contacts, {
    onDelete: 'CASCADE',
  })
  user: User;
}
