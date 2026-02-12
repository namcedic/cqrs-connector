import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { UserEntity } from './entities/user.entity';
import { CreateUserCommand } from './commands/create-user.command';
import { UpdateUserCommand } from './commands/update-user.command';
import { GetUserByIdQuery } from './queries/get-user-by-id.query';
import { GetUsersQuery } from './queries/get-users.query';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginatedResponse } from './interfaces/paginated-response';
import { UserReadModel } from './interfaces/user-read.model';

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async createUser(@Body() createUserDto: CreateUserDto): Promise<UserEntity> {
    return this.commandBus.execute(
      new CreateUserCommand(createUserDto.name, createUserDto.email),
    );
  }

  @Put(':id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserEntity> {
    return this.commandBus.execute(
      new UpdateUserCommand(id, updateUserDto.name, updateUserDto.email),
    );
  }

  @Get()
  async getUsers(
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<UserReadModel>> {
    return this.queryBus.execute(
      new GetUsersQuery(paginationDto.page ?? 1, paginationDto.limit ?? 20),
    );
  }

  @Get(':id')
  async getUserById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserReadModel> {
    return this.queryBus.execute(new GetUserByIdQuery(id));
  }
}
