import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'post' })
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  createdAt: Date;

  @Column()
  edit: boolean;

  @Column()
  updateAt: string;
}
