import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { CreateUserCommand } from '../create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async execute(command: CreateUserCommand): Promise<UserEntity> {
    const user = this.usersRepository.create({
      name: command.name,
      email: command.email,
    });

    return this.usersRepository.save(user);
  }
}
