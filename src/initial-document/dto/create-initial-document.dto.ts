import { IsArray, ArrayMinSize, IsString, MinLength } from 'class-validator';

export class CreateInitialDocumentDto {
	@IsString()
	@MinLength(2)
	proyecto!: string;

	@IsString()
	@MinLength(2)
	contexto!: string;

	@IsArray()
	@ArrayMinSize(1)
	@IsString({ each: true })
	roles!: string[];
}
