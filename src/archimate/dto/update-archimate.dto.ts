import { PartialType } from '@nestjs/mapped-types';
import { CreateArchimateDto } from './create-archimate.dto';

export class UpdateArchimateDto extends PartialType(CreateArchimateDto) {}
