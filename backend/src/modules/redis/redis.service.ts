import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private client: Redis;

  constructor() {
    // Redis non-authoritative — sensitive ops always verify PostgreSQL (§8.1)
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  }

  async del(key: string) {
    try {
      await this.client.del(key);
    } catch {
      // best-effort invalidation — next cache population after recovery fetches fresh data
    }
  }

  async publish(channel: string, message: string) {
    try {
      await this.client.publish(channel, message);
    } catch {
      // non-blocking
    }
  }

  async get(key: string) {
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSec?: number) {
    try {
      if (ttlSec) await this.client.set(key, value, 'EX', ttlSec);
      else await this.client.set(key, value);
    } catch {
      // best-effort
    }
  }
}
