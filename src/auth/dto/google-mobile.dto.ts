import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class GoogleMobileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(40)
  idToken: string;
}
