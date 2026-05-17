import { IsArray, IsOptional, IsString, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'isDiagramJsonSchema', async: false })
class IsDiagramJsonSchemaConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args?: ValidationArguments): boolean {
    const payload = (args?.object ?? {}) as GenerateDiagramFromJsonDto;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }

    const hasNewSchema =
      Array.isArray(payload.componentes) &&
      Array.isArray(payload.tipo) &&
      payload.componentes.length === payload.tipo.length;

    const hasArrayInPayload = Object.values(payload).some((value) => Array.isArray(value));

    const hasEncryptedSchema =
      typeof payload.data === 'string' &&
      payload.data.length > 0;

    return hasNewSchema || hasArrayInPayload || hasEncryptedSchema;
  }

  defaultMessage(): string {
    return 'Payload invalido. Usa componentes/tipo con misma longitud, incluye al menos un arreglo de objetos o envia body cifrado con AES-256-GCM.';
  }
}

export class GenerateDiagramFromJsonDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  componentes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tipo?: string[];

  @IsOptional()
  @IsString()
  alg?: string;

  @IsOptional()
  @IsString()
  iv?: string;

  @IsOptional()
  @IsString()
  data?: string;

  @IsOptional()
  @IsString()
  digest?: string;

  @IsOptional()
  @IsString()
  ts?: string;

  @Validate(IsDiagramJsonSchemaConstraint)
  private readonly schemaCheck = true;

  [key: string]: unknown;
}
