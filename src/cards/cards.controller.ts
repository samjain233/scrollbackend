import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request as Req, UseInterceptors, UploadedFile, BadRequestException, Header } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CardCategory } from './entities/card.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createCardDto: CreateCardDto, @Req() req) {
    return this.cardsService.create(createCardDto, req.user.userId);
  }

  @Get()
  @Header('Cache-Control', 'no-store') // Disable caching for real-time updates
  findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('category') category?: CardCategory,
    @Query('isActive') isActive?: boolean,
  ) {
    // Cap pagination limit to prevent memory issues
    const safePage = Math.max(1, +page || 1);
    const safeLimit = Math.min(100, Math.max(1, +limit || 10));
    return this.cardsService.findAll(safePage, safeLimit, search, category, isActive);
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
  @Post('bulk')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max
    },
  }))
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
