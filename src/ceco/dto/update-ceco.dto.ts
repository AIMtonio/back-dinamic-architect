import { PartialType } from '@nestjs/mapped-types';
import { CreateCecoDto } from './create-ceco.dto';

export class UpdateCecoDto extends PartialType(CreateCecoDto) {}
