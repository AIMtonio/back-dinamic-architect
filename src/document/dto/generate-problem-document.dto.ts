import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class GenerateProblemDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'La problematica debe tener al menos 10 caracteres.' })
  problematica: string;
}
