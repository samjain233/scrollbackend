import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';

export interface MetricPoint {
    timestamp: string;
    cpu: number;
    memory: number;
    latency: number;
    dbConnections: number;
    dbCacheHitRatio: number;
}

export interface ApiMetricPoint {
    timestamp: string;
    totalRequests: number;
    errorRequests: number;
    avgLatency: number;
}

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
    private metrics: MetricPoint[] = [];
    private intervalId: NodeJS.Timeout;
    private MAX_POINTS = 60;
    private INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

    // APM Metrics (In-Memory)
    private apiMetrics: ApiMetricPoint[] = [];
    private currentWindowStart = Date.now();
    private currentWindowRequests = 0;
    private currentWindowErrors = 0;
    private currentWindowLatencySum = 0;
    private slowestEndpoints: { method: string; url: string; duration: number; timestamp: string }[] = [];

    constructor(private prisma: PrismaService) { }

    onModuleInit() {
        // Initial collection
        this.collectMetrics();
        // Start interval
        this.intervalId = setInterval(() => this.collectMetrics(), this.INTERVAL_MS);

        // Aggregate API metrics every 1 minute
        setInterval(() => this.aggregateApiMetrics(), 60 * 1000);
    }

    onModuleDestroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    getHistory(): MetricPoint[] {
        return this.metrics;
    }

    // --- APM Methods ---

    recordRequest(method: string, url: string, statusCode: number, duration: number) {
        this.currentWindowRequests++;
        this.currentWindowLatencySum += duration;
        if (statusCode >= 400) {
            this.currentWindowErrors++;
        }
        this.updateSlowestEndpoints(method, url, duration);
    }

    private updateSlowestEndpoints(method: string, url: string, duration: number) {
        // Keep top 10 slowest
        const newEntry = { method, url, duration, timestamp: new Date().toISOString() };
        this.slowestEndpoints.push(newEntry);
        // Sort descending by duration
        this.slowestEndpoints.sort((a, b) => b.duration - a.duration);
        if (this.slowestEndpoints.length > 10) {
            this.slowestEndpoints.pop();
        }
    }

    private aggregateApiMetrics() {
        const timestamp = new Date().toISOString();
        const avgLatency = this.currentWindowRequests > 0
            ? this.currentWindowLatencySum / this.currentWindowRequests
            : 0;

        const dataPoint: ApiMetricPoint = {
            timestamp,
            totalRequests: this.currentWindowRequests,
            errorRequests: this.currentWindowErrors,
            avgLatency: Math.round(avgLatency),
        };

        this.apiMetrics.push(dataPoint);
        if (this.apiMetrics.length > 60) {
            this.apiMetrics.shift();
        }

        // Reset window stats
        this.currentWindowRequests = 0;
        this.currentWindowErrors = 0;
        this.currentWindowLatencySum = 0;
    }

    getApiHistory() {
        return {
            metrics: this.apiMetrics,
            slowestEndpoints: this.slowestEndpoints,
        };
    }

    private async collectMetrics() {
        const timestamp = new Date().toISOString();

        // CPU Usage
        const cpuUsage = this.getCpuUsage();

        // Memory Usage (System)
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;

        // Database Metrics
        const start = Date.now();
        let dbConnections = 0;
        let dbCacheHitRatio = 0;
        try {
            await this.prisma.$queryRaw`SELECT 1`;

            // Get active connections
            const connectionsRes = await this.prisma.$queryRaw<any[]>`
                SELECT count(*)::int as count FROM pg_stat_activity WHERE state = 'active'
            `;
            dbConnections = connectionsRes[0]?.count || 0;

            // Get cache hit ratio
            const cacheRes = await this.prisma.$queryRaw<any[]>`
                SELECT 
                  sum(heap_blks_read) as heap_read,
                  sum(heap_blks_hit)  as heap_hit
                FROM 
                  pg_statio_user_tables
            `;
            const heapRead = Number(cacheRes[0]?.heap_read || 0);
            const heapHit = Number(cacheRes[0]?.heap_hit || 0);
            const total = heapHit + heapRead;
            dbCacheHitRatio = total > 0 ? (heapHit / total) * 100 : 100;

        } catch (e) {
            // ignore
        }
        const latency = Date.now() - start;

        const dataPoint: MetricPoint = {
            timestamp,
            cpu: cpuUsage,
            memory: parseFloat(memoryUsage.toFixed(1)),
            latency,
            dbConnections,
            dbCacheHitRatio: parseFloat(dbCacheHitRatio.toFixed(2)),
        };

        this.metrics.push(dataPoint);
        if (this.metrics.length > this.MAX_POINTS) {
            this.metrics.shift();
        }

        // Check Thresholds and Create Alerts
        await this.checkThresholds(dataPoint);
    }

    private async checkThresholds(data: MetricPoint): Promise<void> {
        const createAlert = async (type: 'INFO' | 'WARNING' | 'CRITICAL', message: string, source: string) => {
            // Check if similar alert exists in last 10 minutes to avoid spam
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const recent = await this.prisma.alert.findFirst({
                where: {
                    message,
                    createdAt: { gt: tenMinutesAgo },
                    isRead: false
                }
            });

            if (!recent) {
                await this.prisma.alert.create({
                    data: {
                        type,
                        message,
                        source,
                        isRead: false
                    }
                });
            }
        };

        // CPU Check
        if (data.cpu > 85) {
            await createAlert('WARNING', `High CPU Usage detected: ${data.cpu}%`, 'SYSTEM');
        }

        // Memory Check (System %)
        // Total Mem Calculation logic was: ((total - free) / total) * 100
        if (data.memory > 90) {
            await createAlert('WARNING', `High Memory Usage detected: ${data.memory.toFixed(1)}%`, 'SYSTEM');
        }

        // Latency Check
        if (data.latency > 1000) {
            await createAlert('WARNING', `High Database Latency: ${data.latency}ms`, 'DATABASE');
        }

        // Cache Hit Ratio Check
        if (data.dbCacheHitRatio < 95) {
            await createAlert('INFO', `Database Cache Hit Ratio dropped to ${data.dbCacheHitRatio}%`, 'DATABASE');
        }
    }

    private getCpuUsage(): number {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach((cpu) => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type as keyof typeof cpu.times];
            }
            totalIdle += cpu.times.idle;
        });

        return parseFloat(((1 - totalIdle / totalTick) * 100).toFixed(1));
    }
}
