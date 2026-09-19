import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Helper for transaction with same client (required for Four-Eyes executeAction(tx,...) same transaction)
  // Usage: prisma.$transaction(async tx => { await service.executeAction(tx, ...) })
}
