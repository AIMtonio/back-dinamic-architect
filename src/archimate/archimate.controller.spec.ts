import { Test, TestingModule } from '@nestjs/testing';
import { ArchimateController } from './archimate.controller';
import { ArchimateService } from './archimate.service';

describe('ArchimateController', () => {
  let controller: ArchimateController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArchimateController],
      providers: [ArchimateService],
    }).compile();

    controller = module.get<ArchimateController>(ArchimateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
