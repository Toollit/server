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
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type:
    | 'projectJoinRequest'
    | 'approveProjectJoinRequest'
    | 'rejectProjectJoinRequest';

  @Column()
  isRead: boolean;

  // reference: https://typeorm.io/entities#simple-json-column-type
  @Column('simple-json')
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;

  @ManyToOne(() => User, (user) => user.notifications)
  user: User;
}
