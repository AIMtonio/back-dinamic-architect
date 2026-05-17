import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class GenerateProblemDocumentDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MinLength(10, { message: 'La problematica debe tener al menos 10 caracteres.' })
  problematica: string;

  // Campos de payload cifrado AES-256-GCM
  @IsString()
  @IsOptional()
  alg?: string;

  @IsString()
  @IsOptional()
  iv?: string;

  @IsString()
  @IsOptional()
  data?: string;

  @IsString()
  @IsOptional()
  digest?: string;

  @IsString()
  @IsOptional()
  ts?: string;
}
