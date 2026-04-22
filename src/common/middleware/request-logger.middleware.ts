import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../../analytics/analytics.service';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private analyticsService: AnalyticsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const { method, originalUrl } = req;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;

      // Avoid logging analytics endpoints to prevent feedback loops
      if (!originalUrl.startsWith('/analytics')) {
        this.analyticsService.recordRequest(
          method,
          originalUrl,
          statusCode,
          duration,
        );
      }
    });

    next();
  }
}
