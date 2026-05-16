import { Module } from '@nestjs/common';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CardsController],
  providers: [CardsService, OptionalJwtAuthGuard],
})
export class CardsModule {}
