import { Test, TestingModule } from '@nestjs/testing';
import { CecoController } from './ceco.controller';
import { CecoService } from './ceco.service';

describe('CecoController', () => {
  let controller: CecoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CecoController],
      providers: [CecoService],
    }).compile();

    controller = module.get<CecoController>(CecoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
