import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CardCategory } from './entities/card.entity';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';

// XSS sanitization options - strip all HTML tags
const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [], // No HTML allowed
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

@Injectable()
export class CardsService {
  constructor(private prisma: PrismaService) { }

  async create(createCardDto: CreateCardDto, creatorId?: string) {
    // Sanitize user input to prevent XSS
    const sanitizedTitle = sanitizeHtml(createCardDto.title, sanitizeOptions);
    const sanitizedContent = sanitizeHtml(createCardDto.content, sanitizeOptions);

    return this.prisma.card.create({
      data: {
        title: sanitizedTitle,
        imageUrl: createCardDto.imageUrl,
        content: sanitizedContent,
        category: createCardDto.category || 'Uncategorized',
        categoryRel: createCardDto.categoryId ? { connect: { id: createCardDto.categoryId } } : undefined,
        isActive: createCardDto.isActive ?? true,
        overlayOpacity: createCardDto.overlayOpacity ?? 0,
        creator: creatorId ? { connect: { id: creatorId } } : undefined,
      },
    });
  }

  async createBulk(csvContent: string, creatorId: string) {
    const { parse } = await import('csv-parse/sync');

    // Configuration
    const MAX_ROWS = 1000;
    const BATCH_SIZE = 100;

    // Parse CSV with error handling
    let records: any[];
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (parseError: any) {
      throw new BadRequestException(`CSV parsing error: ${parseError.message}`);
    }

    // Check if file is empty
    if (!records || records.length === 0) {
      throw new BadRequestException('CSV file is empty or contains only headers');
    }

    // Enforce row limit
    if (records.length > MAX_ROWS) {
      throw new BadRequestException(`CSV exceeds maximum ${MAX_ROWS} rows. Your file has ${records.length} rows.`);
    }

    // Check for required columns
    const firstRecord = records[0];
    const requiredColumns = ['title', 'content'];
    const missingColumns = requiredColumns.filter(col => !(col in firstRecord));
    const hasImageUrl = 'imageUrl' in firstRecord || 'imageURL' in firstRecord || 'image_url' in firstRecord;
    if (!hasImageUrl) missingColumns.push('imageUrl');

    if (missingColumns.length > 0) {
      throw new BadRequestException(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    // Fetch all existing categories for validation
    const categories = await this.prisma.category.findMany();
    // Create a map for case-insensitive lookup: lowercase name -> Category object
    const categoryMap = new Map<string, any>();
    categories.forEach(cat => categoryMap.set(cat.name.toLowerCase(), cat));

    // Validate and sanitize each row
    const errors: string[] = [];
    const validRecords: any[] = [];

    records.forEach((record: any, index: number) => {
      const rowNum = index + 2;
      const rowErrors: string[] = [];

      const title = record.title?.trim();
      const imageUrl = (record.imageUrl || record.imageURL || record.image_url)?.trim();
      const content = record.content?.trim();
      const categoryName = record.category?.trim();

      if (!title) rowErrors.push('missing title');
      if (!imageUrl) rowErrors.push('missing imageUrl');
      if (!content) rowErrors.push('missing content');
      if (!categoryName) rowErrors.push('missing category');

      // Validate URL format (basic check)
      if (imageUrl && !this.isValidUrl(imageUrl)) {
        rowErrors.push('invalid imageUrl format');
      }

      // Validate Category
      let matchedCategory: any = undefined;
      if (categoryName) {
        matchedCategory = categoryMap.get(categoryName.toLowerCase());
        if (!matchedCategory) {
          rowErrors.push(`category '${categoryName}' not found`);
        }
      }

      if (rowErrors.length > 0) {
        errors.push(`Row ${rowNum}: ${rowErrors.join(', ')}`);
      } else {
        // Sanitize to prevent XSS
        validRecords.push({
          title: sanitizeHtml(title, sanitizeOptions),
          imageUrl,
          content: sanitizeHtml(content, sanitizeOptions),
          category: matchedCategory.name, // Use the official name from DB
          categoryId: matchedCategory.id, // Link to the relation
          isActive: true,
          overlayOpacity: 0,
          creatorId: creatorId,
        });
      }
    });

    // If all rows have errors, throw
    if (validRecords.length === 0) {
      throw new BadRequestException({
        message: 'All rows failed validation',
        errors: errors.slice(0, 10), // Limit to first 10 errors
        totalErrors: errors.length,
      });
    }

    // Insert valid records
    // We cannot use createMany with relations (categoryId) if we want to be strictly safe, 
    // BUT createMany allows setting foreign keys directly (categoryId), so it DOES works.
    const result = await this.prisma.card.createMany({
      data: validRecords as any,
    });

    // Return detailed result
    return {
      success: true,
      created: result.count,
      total: records.length,
      skipped: errors.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      message: errors.length > 0
        ? `Created ${result.count} cards. ${errors.length} rows had errors.`
        : `Successfully created ${result.count} cards.`,
    };
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  async findAll(page: number = 1, limit: number = 10, search?: string, category?: CardCategory, isActive?: boolean) {
    const where: Prisma.CardWhereInput = {
      AND: [
        isActive !== undefined ? { isActive } : {},
        category ? { category } : {},
        search
          ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
            ],
          }
          : {},
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.card.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.card.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    const card = await this.prisma.card.findUnique({
      where: { id },
    });
    if (!card) {
      throw new NotFoundException(`Card with ID ${id} not found`);
    }
    return card;
  }

  async update(id: string, updateCardDto: UpdateCardDto) {
    // Check if card exists
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Card with ID ${id} not found`);
    }

    // Sanitize text fields if provided
    const sanitizedData: any = { ...updateCardDto };
    if (updateCardDto.title) {
      sanitizedData.title = sanitizeHtml(updateCardDto.title, sanitizeOptions);
    }
    if (updateCardDto.content) {
      sanitizedData.content = sanitizeHtml(updateCardDto.content, sanitizeOptions);
    }

    return this.prisma.card.update({
      where: { id },
      data: sanitizedData,
    });
  }

  async remove(id: string) {
    // Check if card exists
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Card with ID ${id} not found`);
    }
    return this.prisma.card.delete({
      where: { id },
    });
  }
}
