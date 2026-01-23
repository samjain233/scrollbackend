import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CardCategory } from './entities/card.entity';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import * as crypto from 'crypto';

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

    const contentHash = this.generateCardHash(sanitizedTitle, sanitizedContent, createCardDto.categoryId);

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
        contentHash,
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



    // --- Hash-Based Duplicate Prevention ---
    let recordsToInsert = validRecords;
    let duplicateCount = 0;

    if (validRecords.length > 0) {
      // 1. Calculate Hashes for all valid records
      const recordsWithHashes = validRecords.map(record => {
        const hash = this.generateCardHash(record.title, record.content, record.categoryId);
        return { ...record, contentHash: hash };
      });

      // 0. Deduplicate within the batch (keep first occurrence)
      const uniqueRecordsMap = new Map<string, any>();
      recordsWithHashes.forEach(record => {
        if (!uniqueRecordsMap.has(record.contentHash)) {
          uniqueRecordsMap.set(record.contentHash, record);
        }
      });
      const uniqueBatchRecords = Array.from(uniqueRecordsMap.values());
      const intraBatchDuplicates = recordsWithHashes.length - uniqueBatchRecords.length;

      // 1. Fetch existing hashes for the unique batch
      const newHashes = uniqueBatchRecords.map(r => r.contentHash);
      const existingCards = await this.prisma.card.findMany({
        where: { contentHash: { in: newHashes } },
        select: { contentHash: true }
      });

      const existingHashSet = new Set(existingCards.map(c => c.contentHash).filter((h): h is string => !!h));

      // 2. Filter out database duplicates
      recordsToInsert = uniqueBatchRecords.filter(r => !existingHashSet.has(r.contentHash));

      // Total skipped = internal duplicates + database duplicates
      duplicateCount = (recordsWithHashes.length - uniqueBatchRecords.length) + (uniqueBatchRecords.length - recordsToInsert.length);
    }

    // If all rows failed validation (no valid records at all)
    if (validRecords.length === 0) {
      // Save critical alert
      await this.prisma.alert.create({
        data: {
          type: 'CRITICAL',
          source: 'BULK_IMPORT',
          message: `Bulk Import Failed: All ${records.length} rows failed validation.`,
          isRead: false,
        }
      });

      throw new BadRequestException({
        message: 'All rows failed validation',
        errors: errors.slice(0, 10),
        totalErrors: errors.length,
      });
    }

    // Save warnings for partial failures
    if (errors.length > 0) {
      const errorLimit = 10;
      const alertsToSave = errors.slice(0, errorLimit).map(err => ({
        type: 'WARNING',
        source: 'BULK_IMPORT',
        message: `Bulk Import Warning: ${err}`,
        isRead: false,
      }));

      await this.prisma.alert.createMany({
        data: alertsToSave as any
      });

      if (errors.length > errorLimit) {
        await this.prisma.alert.create({
          data: {
            type: 'WARNING',
            source: 'BULK_IMPORT',
            message: `...and ${errors.length - errorLimit} more errors in this batch.`,
            isRead: false
          }
        });
      }
    }

    // Insert valid unique records
    let resultCount = 0;
    if (recordsToInsert.length > 0) {
      const result = await this.prisma.card.createMany({
        data: recordsToInsert as any,
      });
      resultCount = result.count;
    }

    // Return detailed result
    const successMessage = recordsToInsert.length > 0
      ? `Successfully created ${resultCount} cards.`
      : `No new cards created.`;

    const duplicateMessage = duplicateCount > 0
      ? ` ${duplicateCount} duplicates skipped.`
      : ``;

    const errorMessage = errors.length > 0
      ? ` ${errors.length} rows had errors.`
      : ``;

    return {
      success: true,
      created: resultCount,
      total: records.length,
      skipped: errors.length + duplicateCount,
      duplicates: duplicateCount,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      message: `${successMessage}${duplicateMessage}${errorMessage}`,
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

  async findAll(page: number = 1, limit: number = 10, search?: string, category?: CardCategory, isActive?: boolean, creatorId?: string) {
    const where: Prisma.CardWhereInput = {
      AND: [
        isActive !== undefined ? { isActive } : {},
        category ? { category } : {},
        creatorId ? { creatorId } : {},
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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          creator: {
            select: {
              name: true,
              email: true,
            },
          },
        },
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

    // Recalculate hash if critical fields change
    if (sanitizedData.title || sanitizedData.content || sanitizedData.categoryId) {
      const titleToHash = sanitizedData.title || existing.title;
      const contentToHash = sanitizedData.content || existing.content;
      // Handle categoryId: if explicit null/undefined in update, handle it? 
      // Typically updateDto fields are optional. 
      // If categoryId is NOT in sanitizedData, use existing. 
      // If it is, use it.
      const categoryIdToHash = 'categoryId' in sanitizedData ? sanitizedData.categoryId : existing.categoryId;

      sanitizedData.contentHash = this.generateCardHash(titleToHash, contentToHash, categoryIdToHash);
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

  private generateCardHash(title: string, content: string, categoryId: string | null | undefined): string {
    const dataToHash = `${title}|${content}|${categoryId || ''}`;
    return crypto.createHash('sha256').update(dataToHash).digest('hex');
  }
}
