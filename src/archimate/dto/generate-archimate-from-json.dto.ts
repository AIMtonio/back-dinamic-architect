import { Transform } from 'class-transformer';
import { IsOptional, IsString, Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'isArchimateElementsArray', async: false })
class IsArchimateElementsArrayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    if (!Array.isArray(value)) {
      return false;
    }

    return value.every((item) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return String(item).trim().length > 0;
      }

      if (!item || typeof item !== 'object') {
        return false;
      }

      const record = item as Record<string, unknown>;
      const rawName =
        record.name ??
        record.nombre ??
        record.title ??
        record.titulo ??
        record.elementname;

      return String(rawName ?? '').trim().length > 0;
    });
  }

  defaultMessage(): string {
    return 'Cada lista debe contener strings/numeros no vacios o objetos con name/nombre/title/titulo.';
  }
}

export class GenerateArchimateFromJsonDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  out?: string;

  @Validate(IsArchimateElementsArrayConstraint)
  businessActors?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  businessactors?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  business_actor?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  business_actors?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  actoresNegocio?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  actoresdeNegocio?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  actores?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  drivers?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  driver?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  impulsores?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  impulsor?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  goals?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  goal?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  objetivos?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  objetivo?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  principles?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  principle?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  principios?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  principio?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  courseOfActions?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  courseofactions?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  courses?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  courseOfAction?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  course_of_actions?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  cursos?: unknown[];

  @Validate(IsArchimateElementsArrayConstraint)
  acciones?: unknown[];

  [key: string]: unknown;
}
