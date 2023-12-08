import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class DeleteAccountRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  a1: string;

  @Column()
  a2: string;

  @Column()
  a3: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;
}
