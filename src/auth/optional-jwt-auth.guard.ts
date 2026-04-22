import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Applies JWT validation only when `Authorization: Bearer …` is present.
 * Leaves `req.user` unset when there is no Bearer token (for public `/cards`).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>();
    const auth = req.headers?.authorization;
    if (
      !auth ||
      typeof auth !== 'string' ||
      !auth.startsWith('Bearer ')
    ) {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }

  override handleRequest<TUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    if (err) {
      throw err instanceof UnauthorizedException
        ? err
        : new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
