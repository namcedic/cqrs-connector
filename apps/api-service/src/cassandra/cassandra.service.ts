import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'cassandra-driver';

@Injectable()
export class CassandraService implements OnModuleInit, OnModuleDestroy {
  private client: Client;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.client = new Client({
      contactPoints: [
        this.configService.get<string>('CASSANDRA_HOST', 'localhost'),
      ],
      localDataCenter: 'datacenter1',
      keyspace: this.configService.get<string>(
        'CASSANDRA_KEYSPACE',
        'user_read',
      ),
      queryOptions: { prepare: true },
    });
  }

  async onModuleDestroy() {
    await this.client.shutdown();
  }

  async execute(query: string, params?: unknown[]) {
    return this.client.execute(query, params);
  }

  async findOne<T>(query: string, params?: unknown[]): Promise<T | null> {
    const result = await this.client.execute(query, params);
    return (result.first() as T) || null;
  }

  async findAll<T>(query: string, params?: unknown[]): Promise<T[]> {
    const result = await this.client.execute(query, params);
    return result.rows as unknown as T[];
  }
}
