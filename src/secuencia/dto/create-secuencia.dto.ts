import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsOptional,
	IsString,
	ValidateNested,
} from 'class-validator';

export class SequenceStepDto {
	@IsString()
	descripcion: string;
}

export class CreateSecuenciaDto {
	@IsString()
	@IsOptional()
	titulo?: string;

	@IsString()
	@IsOptional()
	contexto?: string;

	@IsString()
	@IsOptional()
	actorPrincipal?: string;

	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => SequenceStepDto)
	@IsOptional()
	pasos: SequenceStepDto[];

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
