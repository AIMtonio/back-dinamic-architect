import { PartialType } from '@nestjs/mapped-types';
import { CreateInitialDocumentDto } from './create-initial-document.dto';

export class UpdateInitialDocumentDto extends PartialType(CreateInitialDocumentDto) {}
