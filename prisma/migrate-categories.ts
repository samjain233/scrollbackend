import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting migration...');

    // 1. Fetch all unique categories from Cards
    const cards = await prisma.card.findMany({
        select: { category: true },
        distinct: ['category'],
    });

    const uniqueCategories = cards.map(c => c.category).filter(Boolean);
    console.log(`Found ${uniqueCategories.length} unique categories:`, uniqueCategories);

    // 2. Create Category records
    for (const catName of uniqueCategories) {
        const category = await prisma.category.upsert({
            where: { name: catName },
            update: {},
            create: { name: catName, description: 'Migrated category' },
        });
        console.log(`Ensured category: ${category.name} (${category.id})`);
    }

    // 3. Update Cards with categoryId
    const allCards = await prisma.card.findMany();
    for (const card of allCards) {
        if (card.category && !card.categoryId) {
            const category = await prisma.category.findUnique({ where: { name: card.category } });
            if (category) {
                await prisma.card.update({
                    where: { id: card.id },
                    data: { categoryId: category.id },
                });
                console.log(`Linked card "${card.title}" to category "${category.name}"`);
            }
        }
    }

    console.log('Migration complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
