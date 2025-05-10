import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createTournamentDto: CreateTournamentDto) {
    return this.tournamentsService.create(createTournamentDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.tournamentsService.findAll();
  }

  @Get('next')
  findNext() {
    return this.tournamentsService.findNext();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.tournamentsService.findById(Number(id));
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateTournamentDto: UpdateTournamentDto) {
    return this.tournamentsService.update(Number(id), updateTournamentDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tournamentsService.remove(Number(id));
  }
}