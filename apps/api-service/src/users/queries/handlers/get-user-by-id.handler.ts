import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CassandraService } from '../../../cassandra/cassandra.service';
import { GetUserByIdQuery } from '../get-user-by-id.query';
import { NotFoundException } from '@nestjs/common';

@QueryHandler(GetUserByIdQuery)
export class GetUserByIdHandler implements IQueryHandler<GetUserByIdQuery> {
  constructor(private readonly cassandraService: CassandraService) {}

  async execute(query: GetUserByIdQuery) {
    const user = await this.cassandraService.findOne(
      'SELECT * FROM user_read.users WHERE user_id = ?',
      [query.id],
    );

    if (!user) {
      throw new NotFoundException(
        `User with ID ${query.id} not found in Read DB`,
      );
    }

    return user;
  }
}
