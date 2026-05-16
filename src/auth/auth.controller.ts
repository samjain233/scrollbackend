import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { GoogleMobileDto } from './dto/google-mobile.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /** Knowfy mobile app: exchange Google ID token for a consumer JWT. */
  @HttpCode(HttpStatus.OK)
  @Post('google/mobile')
  knowfyGoogleMobile(@Body() dto: GoogleMobileDto) {
    return this.authService.loginKnowfyWithGoogle(dto.idToken);
  }
}
