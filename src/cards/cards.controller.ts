import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request as Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Header,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CardCategory } from './entities/card.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createCardDto: CreateCardDto, @Req() req) {
    return this.cardsService.create(createCardDto, req.user.userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  @Header('Cache-Control', 'no-store') // Disable caching for real-time updates
  findAll(
    @Req() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('category') category?: CardCategory,
    @Query('isActive') isActive?: boolean,
    @Query('creatorId') creatorId?: string,
    @Query('sort') sort?: string,
    @Query('searchFields') searchFields?: 'title' | 'content' | 'all',
    @Query('moderatorReview') moderatorReview?: string,
    @Query('deviceId') deviceIdForFair?: string,
    @Query('exclude') excludeForFair?: string,
  ) {
    const mrRaw = (moderatorReview ?? 'all').trim().toLowerCase();
    let moderatorReviewFilter: 'pending' | 'reviewed' | undefined;
    if (mrRaw === 'pending') moderatorReviewFilter = 'pending';
    else if (mrRaw === 'reviewed') moderatorReviewFilter = 'reviewed';
    else moderatorReviewFilter = undefined;

    if (moderatorReviewFilter) {
      if (!req.user?.userId) {
        throw new UnauthorizedException(
          'Authentication required when filtering by moderator review status',
        );
      }
    }

    // Cap pagination limit to prevent memory issues
    const safePage = Math.max(1, +page || 1);
    const safeLimit = Math.min(100, Math.max(1, +limit || 10));
    return this.cardsService.findAll(
      safePage,
      safeLimit,
      search,
      category,
      isActive,
      creatorId,
      sort,
      searchFields,
      req.user?.userId,
      moderatorReviewFilter,
      deviceIdForFair,
      excludeForFair,
    );
  }

  /** User-app fair feed: record that this device has surfaced these cards (batch). */
  @Post('impressions')
  recordFairImpressions(
    @Body() body: { deviceId?: string; cardIds?: string[] },
  ) {
    if (!body?.deviceId || !Array.isArray(body.cardIds)) {
      throw new BadRequestException('deviceId and cardIds are required');
    }
    return this.cardsService.recordFairImpressions(
      body.deviceId,
      body.cardIds,
    );
  }

  /** User-app: per-card time in view; server maps to category affinity for future fair order. */
  @Post('dwell')
  recordDwell(
    @Body()
    body: {
      deviceId?: string;
      events?: { cardId: string; durationMs: number }[];
    },
  ) {
    if (!body?.deviceId || !Array.isArray(body?.events)) {
      throw new BadRequestException('deviceId and events are required');
    }
    return this.cardsService.recordDwellEvents(body.deviceId, body.events);
  }

  /// Static `review` segment first — avoids routers that mishandle `/:id/review`.
  @UseGuards(JwtAuthGuard)
  @Post('review/:id')
  markModeratorReview(@Param('id') id: string, @Req() req) {
    return this.cardsService.markModeratorReview(id, req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cardsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCardDto: UpdateCardDto) {
    return this.cardsService.update(id, updateCardDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadCardImage(@UploadedFile() file: Express.Multer.File, @Req() req) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const baseUrl =
      process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    return this.cardsService.uploadCardImage(file, baseUrl);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bulk')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
      },
    }),
  )
  async createBulk(@UploadedFile() file: Express.Multer.File, @Req() req) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }
    const csvContent = file.buffer.toString();
    return this.cardsService.createBulk(csvContent, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cardsService.remove(id);
  }
}
