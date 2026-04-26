import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CardCategory } from './entities/card.entity';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import * as crypto from 'crypto';
import type { Express } from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// XSS sanitization options - strip all HTML tags
const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [], // No HTML allowed
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

@Injectable()
export class CardsService {
  constructor(private prisma: PrismaService) {}

  async create(createCardDto: CreateCardDto, creatorId?: string) {
    // Sanitize user input to prevent XSS
    const sanitizedTitle = sanitizeHtml(createCardDto.title, sanitizeOptions);
    const sanitizedContent = sanitizeHtml(
      createCardDto.content,
      sanitizeOptions,
    );

    const contentHash = this.generateCardHash(
      sanitizedTitle,
      sanitizedContent,
      createCardDto.categoryId,
    );

    return this.prisma.card.create({
      data: {
        title: sanitizedTitle,
        imageUrl: createCardDto.imageUrl,
        content: sanitizedContent,
        category: createCardDto.category || 'Uncategorized',
        categoryRel: createCardDto.categoryId
          ? { connect: { id: createCardDto.categoryId } }
          : undefined,
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
      throw new BadRequestException(
        'CSV file is empty or contains only headers',
      );
    }

    // Enforce row limit
    if (records.length > MAX_ROWS) {
      throw new BadRequestException(
        `CSV exceeds maximum ${MAX_ROWS} rows. Your file has ${records.length} rows.`,
      );
    }

    // Check for required columns
    const firstRecord = records[0];
    const requiredColumns = ['title', 'content'];
    const missingColumns = requiredColumns.filter(
      (col) => !(col in firstRecord),
    );
    const hasImageUrl =
      'imageUrl' in firstRecord ||
      'imageURL' in firstRecord ||
      'image_url' in firstRecord;
    if (!hasImageUrl) missingColumns.push('imageUrl');

    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Missing required columns: ${missingColumns.join(', ')}`,
      );
    }

    // Fetch all existing categories for validation
    const categories = await this.prisma.category.findMany();
    // Create a map for case-insensitive lookup: lowercase name -> Category object
    const categoryMap = new Map<string, any>();
    categories.forEach((cat) => categoryMap.set(cat.name.toLowerCase(), cat));

    // Validate and sanitize each row
    const errors: string[] = [];
    const validRecords: any[] = [];

    records.forEach((record: any, index: number) => {
      const rowNum = index + 2;
      const rowErrors: string[] = [];

      const title = record.title?.trim();
      const imageUrl = (
        record.imageUrl ||
        record.imageURL ||
        record.image_url
      )?.trim();
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
      const recordsWithHashes = validRecords.map((record) => {
        const hash = this.generateCardHash(
          record.title,
          record.content,
          record.categoryId,
        );
        return { ...record, contentHash: hash };
      });

      // 0. Deduplicate within the batch (keep first occurrence)
      const uniqueRecordsMap = new Map<string, any>();
      recordsWithHashes.forEach((record) => {
        if (!uniqueRecordsMap.has(record.contentHash)) {
          uniqueRecordsMap.set(record.contentHash, record);
        }
      });
      const uniqueBatchRecords = Array.from(uniqueRecordsMap.values());
      const intraBatchDuplicates =
        recordsWithHashes.length - uniqueBatchRecords.length;

      // 1. Fetch existing hashes for the unique batch
      const newHashes = uniqueBatchRecords.map((r) => r.contentHash);
      const existingCards = await this.prisma.card.findMany({
        where: { contentHash: { in: newHashes } },
        select: { contentHash: true },
      });

      const existingHashSet = new Set(
        existingCards.map((c) => c.contentHash).filter((h): h is string => !!h),
      );

      // 2. Filter out database duplicates
      recordsToInsert = uniqueBatchRecords.filter(
        (r) => !existingHashSet.has(r.contentHash),
      );

      // Total skipped = internal duplicates + database duplicates
      duplicateCount =
        recordsWithHashes.length -
        uniqueBatchRecords.length +
        (uniqueBatchRecords.length - recordsToInsert.length);
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
        },
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
      const alertsToSave = errors.slice(0, errorLimit).map((err) => ({
        type: 'WARNING',
        source: 'BULK_IMPORT',
        message: `Bulk Import Warning: ${err}`,
        isRead: false,
      }));

      await this.prisma.alert.createMany({
        data: alertsToSave as any,
      });

      if (errors.length > errorLimit) {
        await this.prisma.alert.create({
          data: {
            type: 'WARNING',
            source: 'BULK_IMPORT',
            message: `...and ${errors.length - errorLimit} more errors in this batch.`,
            isRead: false,
          },
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
    const successMessage =
      recordsToInsert.length > 0
        ? `Successfully created ${resultCount} cards.`
        : `No new cards created.`;

    const duplicateMessage =
      duplicateCount > 0 ? ` ${duplicateCount} duplicates skipped.` : ``;

    const errorMessage =
      errors.length > 0 ? ` ${errors.length} rows had errors.` : ``;

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

  /** Dwell heuristics (ms): quick skip (headline only) vs engaged read. */
  private static readonly DWELL_MIN_MS = 200;
  private static readonly DWELL_MAX_MS = 5 * 60 * 1000;
  private static readonly DWELL_QUICK_MS = 4000;
  private static readonly DWELL_ENGAGED_MS = 8000;

  /** Delta applied to [deviceId, category] score; summed per batch, then clamped in DB. */
  dwellScoreDeltaMs(durationMs: number): number {
    if (
      durationMs < CardsService.DWELL_MIN_MS ||
      durationMs > CardsService.DWELL_MAX_MS
    ) {
      return 0;
    }
    if (durationMs <= CardsService.DWELL_QUICK_MS) {
      return -0.12; // likely skim / skip
    }
    if (durationMs < CardsService.DWELL_ENGAGED_MS) {
      return 0.05;
    }
    return 0.2; // longer engagement → boost category
  }

  /**
   * Fair feed for the user app: order by least recently shown per device, then
   * by category affinity (learned from dwell), then light randomness for cold start.
   * Pagination: pass every card id already in the client list as `exclude` (comma in query), not page offset.
   */
  async findAllFair(
    deviceId: string,
    limit: number,
    category?: CardCategory,
    excludeIds: string[] = [],
  ) {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const exclude = excludeIds
      .filter((id) => uuidRe.test(id))
      .slice(0, 200);

    const whereCount: Prisma.CardWhereInput = {
      isActive: true,
      ...(category ? { category } : {}),
    };
    const total = await this.prisma.card.count({ where: whereCount });

    // Cast to text: Card.id may be uuid or text in DB; avoid `text <> uuid` on NOT IN / join.
    const notIn =
      exclude.length > 0
        ? Prisma.sql`AND c.id::text NOT IN (${Prisma.join(
            exclude.map((id) => Prisma.sql`${id}`),
          )})`
        : Prisma.empty;

    const categorySql = category
      ? Prisma.sql`AND c."category" = ${category}`
      : Prisma.empty;

    const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c.id::text AS id
      FROM "Card" c
      LEFT JOIN "DeviceCardImpression" d
        ON c.id::text = d."cardId" AND d."deviceId" = ${deviceId}
      LEFT JOIN "DeviceCategoryAffinity" aff
        ON aff."deviceId" = ${deviceId} AND aff."category" = c."category"
      WHERE c."isActive" = true
      ${categorySql}
      ${notIn}
      ORDER BY
        d."lastShownAt" ASC NULLS FIRST,
        COALESCE(aff."score", 0) DESC,
        RANDOM(),
        c."createdAt" DESC,
        c."id" ASC
      LIMIT ${limit}
    `);

    if (idRows.length === 0) {
      return { data: [], total, page: 1, limit };
    }

    const orderedIds = idRows.map((r) => r.id);
    const fullRows = await this.prisma.card.findMany({
      where: { id: { in: orderedIds } },
      include: {
        creator: { select: { name: true, email: true } },
      },
    });
    const byId = new Map(fullRows.map((c) => [c.id, c]));
    const data = orderedIds
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => c != null);

    return { data, total, page: 1, limit };
  }

  async recordFairImpressions(deviceId: string, cardIds: string[]) {
    if (!deviceId || cardIds.length === 0) {
      return { ok: true as const, updated: 0 };
    }
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const unique = [...new Set(cardIds.filter((id) => uuidRe.test(id)))].slice(
      0,
      50,
    );
    if (unique.length === 0) {
      return { ok: true as const, updated: 0 };
    }
    const now = new Date();
    await this.prisma.$transaction(
      unique.map((cardId) =>
        this.prisma.deviceCardImpression.upsert({
          where: {
            deviceId_cardId: { deviceId, cardId },
          },
          create: { deviceId, cardId, lastShownAt: now },
          update: { lastShownAt: now },
        }),
      ),
    );
    return { ok: true as const, updated: unique.length };
  }

  /**
   * User-app: record how long each card was in view. Updates per-(device, category) affinity.
   */
  async recordDwellEvents(
    deviceId: string,
    events: { cardId: string; durationMs: number }[],
  ) {
    if (!deviceId?.trim() || !events?.length) {
      return { ok: true as const, updatedCategories: 0 };
    }
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const capped = events
      .filter(
        (e) =>
          uuidRe.test(e.cardId) &&
          typeof e.durationMs === 'number' &&
          Number.isFinite(e.durationMs),
      )
      .slice(0, 40);
    if (capped.length === 0) {
      return { ok: true as const, updatedCategories: 0 };
    }
    const ids = [...new Set(capped.map((e) => e.cardId))];
    const cards = await this.prisma.card.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, category: true },
    });
    const byId = new Map(cards.map((c) => [c.id, c]));
    const deltaByCategory = new Map<string, number>();
    for (const e of capped) {
      const card = byId.get(e.cardId);
      if (!card) continue;
      const d = this.dwellScoreDeltaMs(Math.round(e.durationMs));
      if (d === 0) continue;
      const prev = deltaByCategory.get(card.category) ?? 0;
      deltaByCategory.set(card.category, prev + d);
    }
    if (deltaByCategory.size === 0) {
      return { ok: true as const, updatedCategories: 0 };
    }
    const did = deviceId.trim();
    for (const [category, totalDelta] of deltaByCategory) {
      if (totalDelta === 0) continue;
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "DeviceCategoryAffinity" ("id", "deviceId", "category", "score", "updatedAt")
        VALUES (
          gen_random_uuid(),
          ${did},
          ${category},
          GREATEST(-1.0::float, LEAST(1.0::float, ${totalDelta}::float)),
          NOW()
        )
        ON CONFLICT ("deviceId", "category")
        DO UPDATE SET
          "score" = GREATEST(
            -1.0::float,
            LEAST(1.0::float, "DeviceCategoryAffinity"."score" + ${totalDelta}::float)
          ),
          "updatedAt" = NOW()
      `);
    }
    return {
      ok: true as const,
      updatedCategories: deltaByCategory.size,
    };
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    category?: CardCategory,
    isActive?: boolean,
    creatorId?: string,
    sort?: string,
    searchFields?: 'title' | 'content' | 'all',
    moderatorId?: string,
    moderatorReview?: 'pending' | 'reviewed',
    deviceIdForFair?: string,
    excludeForFair?: string,
  ) {
    const sortNorm = (sort ?? 'newest').toLowerCase();
    if (
      sortNorm === 'fair' &&
      !search?.trim() &&
      !creatorId &&
      !moderatorReview &&
      isActive !== false
    ) {
      if (!deviceIdForFair || deviceIdForFair.trim().length < 8) {
        throw new BadRequestException(
          'deviceId query param is required when sort=fair',
        );
      }
      const excludeIds =
        excludeForFair
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      return this.findAllFair(
        deviceIdForFair.trim(),
        Math.min(100, Math.max(1, limit || 10)),
        category,
        excludeIds,
      );
    }
    const sf = searchFields ?? 'title';
    const searchClause: Prisma.CardWhereInput =
      search && search.trim().length > 0
        ? {
            OR: [
              ...(sf === 'title' || sf === 'all'
                ? [
                    {
                      title: {
                        contains: search.trim(),
                        mode: 'insensitive' as const,
                      },
                    },
                  ]
                : []),
              ...(sf === 'content' || sf === 'all'
                ? [
                    {
                      content: {
                        contains: search.trim(),
                        mode: 'insensitive' as const,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {};

    const reviewFilter: Prisma.CardWhereInput =
      moderatorReview === 'pending' && moderatorId
        ? {
            moderatorReviews: {
              none: { moderatorId },
            },
          }
        : moderatorReview === 'reviewed' && moderatorId
          ? {
              moderatorReviews: {
                some: { moderatorId },
              },
            }
          : {};

    const where: Prisma.CardWhereInput = {
      AND: [
        isActive !== undefined ? { isActive } : {},
        category ? { category } : {},
        creatorId ? { creatorId } : {},
        searchClause,
        reviewFilter,
      ],
    };

    let orderBy: Prisma.CardOrderByWithRelationInput[] = [
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
    switch (sort) {
      case 'oldest':
        orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
        break;
      case 'title_az':
        orderBy = [{ title: 'asc' }, { id: 'asc' }];
        break;
      case 'title_za':
        orderBy = [{ title: 'desc' }, { id: 'desc' }];
        break;
      case 'updated_newest':
        orderBy = [{ updatedAt: 'desc' }, { id: 'desc' }];
        break;
      case 'updated_oldest':
        orderBy = [{ updatedAt: 'asc' }, { id: 'asc' }];
        break;
      case 'newest':
      default:
        orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
        break;
    }

    const [data, total] = await Promise.all([
      this.prisma.card.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
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

  async uploadCardImage(file: Express.Multer.File, publicBaseUrl: string) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported image type: ${file.mimetype}. Use JPEG, PNG, GIF, or WebP.`,
      );
    }
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    const ext = extMap[file.mimetype];
    const dir = join(process.cwd(), 'uploads', 'card-images');
    await fs.mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(dir, filename), file.buffer);
    const base = publicBaseUrl.replace(/\/+$/, '');
    const url = `${base}/uploads/card-images/${filename}`;
    return { url };
  }

  async markModeratorReview(cardId: string, moderatorId: string) {
    await this.prisma.card.findUniqueOrThrow({
      where: { id: cardId },
    });
    return this.prisma.moderatorCardReview.upsert({
      where: {
        moderatorId_cardId: { moderatorId, cardId },
      },
      create: { moderatorId, cardId },
      update: { reviewedAt: new Date() },
    });
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
      sanitizedData.content = sanitizeHtml(
        updateCardDto.content,
        sanitizeOptions,
      );
    }

    // Recalculate hash if critical fields change
    if (
      sanitizedData.title ||
      sanitizedData.content ||
      sanitizedData.categoryId
    ) {
      const titleToHash = sanitizedData.title || existing.title;
      const contentToHash = sanitizedData.content || existing.content;
      // Handle categoryId: if explicit null/undefined in update, handle it?
      // Typically updateDto fields are optional.
      // If categoryId is NOT in sanitizedData, use existing.
      // If it is, use it.
      const categoryIdToHash =
        'categoryId' in sanitizedData
          ? sanitizedData.categoryId
          : existing.categoryId;

      sanitizedData.contentHash = this.generateCardHash(
        titleToHash,
        contentToHash,
        categoryIdToHash,
      );
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

  private generateCardHash(
    title: string,
    content: string,
    categoryId: string | null | undefined,
  ): string {
    const dataToHash = `${title}|${content}|${categoryId || ''}`;
    return crypto.createHash('sha256').update(dataToHash).digest('hex');
  }
}
