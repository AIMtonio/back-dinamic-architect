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

    return hasNewSchema || hasArrayInPayload;
  }

  defaultMessage(): string {
    return 'Payload invalido. Usa componentes/tipo con misma longitud o incluye al menos un arreglo de objetos.';
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

  @Validate(IsDiagramJsonSchemaConstraint)
  private readonly schemaCheck = true;

  [key: string]: unknown;
}
