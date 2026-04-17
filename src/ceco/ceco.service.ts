import { Injectable } from '@nestjs/common';
import { CreateCecoDto } from './dto/create-ceco.dto';
import { UpdateCecoDto } from './dto/update-ceco.dto';
import * as fs from 'fs';
import * as path from 'path';

export interface CecoEntry {
  ceco: string;
  nombreCorto: string;
  nombreLargo: string;
  responsable: string;
}

@Injectable()
export class CecoService {
  private readonly cecoPath = path.join(process.cwd(), 'src', 'data', 'layouts', 'ceco.json');

  findAll(): CecoEntry[] {
    const raw = fs.readFileSync(this.cecoPath, 'utf8');
    return JSON.parse(raw) as CecoEntry[];
  }

  search(keyword: string): CecoEntry[] {
    const all = this.findAll();
    const lower = keyword.toLowerCase();
    return all.filter((item) =>
      item.nombreCorto.toLowerCase().includes(lower),
    );
  }

  create(createCecoDto: CreateCecoDto) {
    return 'This action adds a new ceco';
  }

  findOne(id: number) {
    return `This action returns a #${id} ceco`;
  }

  update(id: number, updateCecoDto: UpdateCecoDto) {
    return `This action updates a #${id} ceco`;
  }

  remove(id: number) {
    return `This action removes a #${id} ceco`;
  }
}
