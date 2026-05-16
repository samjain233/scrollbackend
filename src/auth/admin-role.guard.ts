import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Use after JwtAuthGuard. Admin panel / moderator routes only.
 * Knowfy mobile users get JWT with role "consumer" (default legacy tokens = admin).
 */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const role = user?.role ?? 'admin';
    if (role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
