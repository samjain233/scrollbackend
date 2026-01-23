
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting backfill of contentHash...');

    // Fetch cards where contentHash is missing
    // Using 'any' cast because the Prisma Client might not have fully regenerated types yet due to file lock
    const cards = await (prisma.card as any).findMany({
        where: {
            contentHash: null
        }
    });

    console.log(`Found ${cards.length} cards to backfill.`);

    let updated = 0;
    for (const card of cards) {
        // Generate Hash: title + content + categoryId
        const dataToHash = `${card.title}|${card.content}|${card.categoryId || ''}`;
        const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

        await prisma.card.update({
            where: { id: card.id },
            data: {
                contentHash: hash
            }
        });
        updated++;
        if (updated % 10 === 0) process.stdout.write('.');
    }

    console.log(`\nBackfill complete. Updated ${updated} cards.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
