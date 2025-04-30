import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { CourtsService } from './courts.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('courts')
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.courtsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.courtsService.findById(id);
  }
}