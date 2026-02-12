import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EachMessagePayload, Kafka } from 'kafkajs';
import { CassandraService } from '../cassandra/cassandra.service';
import {
  DebeziumMessage,
  DebeziumUser,
  getEnvelope,
} from './types/debezium-event';

@Injectable()
export class CdcConsumerService implements OnModuleInit {
  private readonly logger = new Logger(CdcConsumerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cassandraService: CassandraService,
  ) {}

  async onModuleInit() {
    const broker = this.configService.get<string>(
      'KAFKA_BROKER',
      'localhost:9092',
    );
    const topic = this.configService.get<string>(
      'KAFKA_USERS_TOPIC',
      'mysql.app.users',
    );

    const kafka = new Kafka({
      clientId: 'cdc-consumer',
      brokers: [broker],
    });

    const consumer = kafka.consumer({ groupId: 'users-cdc-consumer' });

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    await consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        this.logger.debug(`Received message from topic: ${payload.topic}`);
        await this.handleMessage(payload);
      },
    });

    this.logger.log(`Subscribed to topic ${topic} on broker ${broker}`);
  }

  private async handleMessage({ message }: EachMessagePayload) {
    if (!message.value) return;

    const rawMessage = message.value.toString('utf-8');
    this.logger.debug(`Processing message: ${rawMessage.substring(0, 100)}...`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage) as unknown;
    } catch (err) {
      this.logger.error(
        `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const env = getEnvelope<DebeziumUser>(
      parsed as DebeziumMessage<DebeziumUser>,
    );
    if (!env) {
      this.logger.warn('Valid Debezium envelope not found in message');
      return;
    }

    const userIdRaw = env.after?.id || env.before?.id;
    this.logger.log(`Handling operation: ${env.op} for user_id: ${userIdRaw}`);

    if (env.op === 'd') {
      const before = env.before;
      if (!before) {
        this.logger.warn('Envelope "before" state is missing for delete op');
        return;
      }

      const userId = Number(before.id);
      if (!Number.isFinite(userId)) {
        this.logger.warn(`Invalid user id on delete: ${before.id}`);
        return;
      }

      try {
        await this.cassandraService.deleteUser(userId);
        this.logger.log(
          `Successfully deleted user_id: ${userId} from Cassandra`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to delete from Cassandra: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      return;
    }

    const after = env.after;
    if (!after) {
      this.logger.warn('Envelope "after" state is missing');
      return;
    }

    const userId = Number(after.id);
    if (!Number.isFinite(userId)) {
      this.logger.warn(`Invalid user id: ${after.id}`);
      return;
    }

    try {
      await this.cassandraService.upsertUser({
        userId,
        name: after.name,
        email: after.email,
        createdAt: after.created_at ? new Date(after.created_at) : null,
        updatedAt: after.updated_at ? new Date(after.updated_at) : null,
      });
      this.logger.log(`Successfully synced user_id: ${userId} to Cassandra`);
    } catch (err) {
      this.logger.error(
        `Failed to sync to Cassandra: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
