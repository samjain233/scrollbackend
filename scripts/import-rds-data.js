const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const FILES = {
  cards: 'C:\\Users\\sambhav jain\\Downloads\\part-00000-a63a7f40-54ff-4844-802d-48a0490abc21-c000.csv',
  alerts: 'C:\\Users\\sambhav jain\\Downloads\\part-00000-06bf27d5-6569-4f48-92ba-31424c9bef86-c000.csv',
  admins: 'C:\\Users\\sambhav jain\\Downloads\\part-00000-676437b1-17f6-4df8-bc76-8bf276db74e1-c000.csv',
  categories: 'C:\\Users\\sambhav jain\\Downloads\\part-00000-a072c197-e151-4c0f-b123-4795274f8efc-c000.csv',
};

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function toDateOrNow(value) {
  if (!value) return new Date();
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

async function main() {
  console.log('Reading CSV files...');
  const admins = readCsv(FILES.admins).map((r) => ({
    id: r.id,
    email: r.email,
    password: r.password,
    name: r.name,
    createdAt: toDateOrNow(r.createdAt),
    updatedAt: toDateOrNow(r.updatedAt),
  }));

  const categories = readCsv(FILES.categories).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description || null,
    createdAt: toDateOrNow(r.createdAt),
    updatedAt: toDateOrNow(r.updatedAt),
  }));

  const cards = readCsv(FILES.cards).map((r) => ({
    id: r.id,
    title: r.title,
    imageUrl: r.imageUrl,
    content: r.content,
    category: r.category,
    isActive: toBool(r.isActive),
    createdAt: toDateOrNow(r.createdAt),
    updatedAt: toDateOrNow(r.updatedAt),
    overlayOpacity: Number.parseInt(String(r.overlayOpacity || '0'), 10) || 0,
    creatorId: r.creatorId || null,
    categoryId: r.categoryId || null,
    contentHash: r.contentHash || null,
  }));

  const alerts = readCsv(FILES.alerts).map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    source: r.source,
    isRead: toBool(r.isRead),
    createdAt: toDateOrNow(r.createdAt),
  }));

  console.log('Importing data...');
  const adminResult = admins.length
    ? await prisma.admin.createMany({ data: admins, skipDuplicates: true })
    : { count: 0 };
  const categoryResult = categories.length
    ? await prisma.category.createMany({ data: categories, skipDuplicates: true })
    : { count: 0 };
  const cardResult = cards.length
    ? await prisma.card.createMany({ data: cards, skipDuplicates: true })
    : { count: 0 };
  const alertResult = alerts.length
    ? await prisma.alert.createMany({ data: alerts, skipDuplicates: true })
    : { count: 0 };

  const totals = {
    admins: await prisma.admin.count(),
    categories: await prisma.category.count(),
    cards: await prisma.card.count(),
    alerts: await prisma.alert.count(),
  };

  console.log('Inserted (new rows this run):');
  console.log({
    admins: adminResult.count,
    categories: categoryResult.count,
    cards: cardResult.count,
    alerts: alertResult.count,
  });
  console.log('Current table totals:');
  console.log(totals);
}

main()
  .catch((err) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
