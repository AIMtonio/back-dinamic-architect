import { Test, TestingModule } from '@nestjs/testing';
import { InitialDocumentController } from './initial-document.controller';
import { InitialDocumentService } from './initial-document.service';

describe('InitialDocumentController', () => {
  let controller: InitialDocumentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InitialDocumentController],
      providers: [InitialDocumentService],
    }).compile();

    controller = module.get<InitialDocumentController>(InitialDocumentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
