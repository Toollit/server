import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './User';

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 1000 })
  content: string;

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
}
