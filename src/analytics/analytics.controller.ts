import { Controller, Get, Patch, Param } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import * as os from 'os';

@Controller('analytics')
export class AnalyticsController {
    constructor(
        private analyticsService: AnalyticsService,
        private prisma: PrismaService
    ) { }

    @Get('history')
    getHistory() {
        return this.analyticsService.getHistory();
    }

    @Get('api')
    getApiHistory() {
        return this.analyticsService.getApiHistory();
    }

    @Get('alerts/count')
    async getAlertsCount() {
        const count = await this.prisma.alert.count({
            where: { isRead: false }
        });
        return { count };
    }

    @Get('alerts')
    getAlerts() {
        return this.prisma.alert.findMany({
            where: { isRead: false },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
    }

    @Patch('alerts/:id/read')
    async markAlertAsRead(@Param('id') id: string) {
        return this.prisma.alert.update({
            where: { id },
            data: { isRead: true }
        });
    }

    @Get('system')
    getSystemStats() {
        const cpus = os.cpus();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;

        // Calculate CPU usage
        let totalIdle = 0;
        let totalTick = 0;
        cpus.forEach((cpu) => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type as keyof typeof cpu.times];
            }
            totalIdle += cpu.times.idle;
        });
        const cpuUsage = ((1 - totalIdle / totalTick) * 100).toFixed(1);

        return {
            cpu: {
                cores: cpus.length,
                model: cpus[0]?.model || 'Unknown',
                usage: parseFloat(cpuUsage),
            },
            memory: {
                total: this.formatBytes(totalMemory),
                used: this.formatBytes(usedMemory),
                free: this.formatBytes(freeMemory),
                usagePercent: parseFloat(((usedMemory / totalMemory) * 100).toFixed(1)),
            },
            system: {
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
                uptime: this.formatUptime(os.uptime()),
                nodeVersion: process.version,
            },
            process: {
                pid: process.pid,
                uptime: this.formatUptime(process.uptime()),
                memoryUsage: this.formatBytes(process.memoryUsage().heapUsed),
            },
        };
    }

    private formatBytes(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let unitIndex = 0;
        let value = bytes;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        return `${value.toFixed(1)} ${units[unitIndex]}`;
    }

    private formatUptime(seconds: number): string {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }
}
