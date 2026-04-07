import { PartialType } from '@nestjs/mapped-types';
import { CreateSecuenciaDto } from './create-secuencia.dto';

export class UpdateSecuenciaDto extends PartialType(CreateSecuenciaDto) {}
