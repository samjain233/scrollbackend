import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
    constructor(private prisma: PrismaService) { }

    create(data: { name: string; description?: string }) {
        return this.prisma.category.create({
            data,
        });
    }

    findAll() {
        return this.prisma.category.findMany({
            orderBy: { name: 'asc' },
        });
    }

    async findOne(id: string) {
        const category = await this.prisma.category.findUnique({
            where: { id },
        });
        if (!category) {
            throw new NotFoundException(`Category with ID ${id} not found`);
        }
        return category;
    }

    async update(id: string, data: { name?: string; description?: string }) {
        const existing = await this.prisma.category.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Category with ID ${id} not found`);
        }
        return this.prisma.category.update({
            where: { id },
            data,
        });
    }

    async remove(id: string) {
        const existing = await this.prisma.category.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Category with ID ${id} not found`);
        }
        return this.prisma.category.delete({
            where: { id },
        });
    }
}
