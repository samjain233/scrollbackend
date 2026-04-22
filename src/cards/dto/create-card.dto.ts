import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsUrl,
} from 'class-validator';

export class CreateCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Title must be 200 characters or less' })
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'Image URL must be 2000 characters or less' })
  imageUrl: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000, { message: 'Content must be 10000 characters or less' })
  content: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  overlayOpacity?: number;
}
