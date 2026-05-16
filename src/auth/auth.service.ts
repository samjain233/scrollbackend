import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly oauth2 = new OAuth2Client();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.prisma.admin.findUnique({ where: { email } });
    if (user && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload = {
      email: user.email,
      sub: user.id,
      name: user.name,
      role: 'admin' as const,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  private audiencesForGoogleSignIn(): string[] {
    const raw =
      process.env.GOOGLE_SIGN_IN_AUDIENCE || process.env.GOOGLE_WEB_CLIENT_ID;
    const list = raw
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return list ?? [];
  }

  /**
   * Validates Google ID tokens from the mobile app. Set env to the OAuth *Web*
   * client ID used by Flutter `GoogleSignIn(serverClientId: ...)`.
   */
  async loginKnowfyWithGoogle(idToken: string) {
    const audiences = this.audiencesForGoogleSignIn();
    if (audiences.length === 0) {
      throw new BadRequestException(
        'Missing GOOGLE_SIGN_IN_AUDIENCE or GOOGLE_WEB_CLIENT_ID env (comma-separated OAuth client IDs).',
      );
    }
    let p:
      | {
          sub?: string;
          email?: string;
          name?: string;
          given_name?: string;
          picture?: string;
        }
      | undefined;
    try {
      const ticket = await this.oauth2.verifyIdToken({
        idToken,
        audience: audiences,
      });
      p = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    const sub = p?.sub ? String(p.sub) : '';
    const emailRaw = typeof p?.email === 'string' ? p.email : '';
    const email = emailRaw || null;
    const nameRaw =
      (typeof p?.name === 'string' ? p.name : '') ||
      (typeof p?.given_name === 'string' ? p.given_name : '');
    const pictureUrlRaw = typeof p?.picture === 'string' ? p.picture : '';

    if (!sub) {
      throw new UnauthorizedException('Invalid Google token payload');
    }

    let user = await this.prisma.knowfyUser.findUnique({
      where: { googleSub: sub },
    });
    const nowPicture = pictureUrlRaw || null;
    if (!user) {
      user = await this.prisma.knowfyUser.create({
        data: {
          googleSub: sub,
          email,
          name: nameRaw || email || 'Knowfy User',
          pictureUrl: nowPicture,
        },
      });
    } else if (
      (email && email !== user.email) ||
      (nameRaw && nameRaw !== user.name) ||
      (nowPicture !== null && nowPicture !== user.pictureUrl)
    ) {
      user = await this.prisma.knowfyUser.update({
        where: { id: user.id },
        data: {
          email: email ?? user.email,
          name: nameRaw || user.name,
          pictureUrl: nowPicture ?? user.pictureUrl,
        },
      });
    }

    const jwtPayload = {
      sub: user.id,
      email: user.email ?? '',
      name: user.name ?? '',
      role: 'consumer' as const,
    };
    return {
      access_token: this.jwtService.sign(jwtPayload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        pictureUrl: user.pictureUrl,
      },
    };
  }
}
