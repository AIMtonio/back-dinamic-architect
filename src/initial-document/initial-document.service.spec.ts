import { Test, TestingModule } from '@nestjs/testing';
import { InitialDocumentService } from './initial-document.service';

describe('InitialDocumentService', () => {
  let service: InitialDocumentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InitialDocumentService],
    }).compile();

    service = module.get<InitialDocumentService>(InitialDocumentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
