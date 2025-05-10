import { Controller, Get, Post, Body, Param, Delete, UseGuards, Request, Put, ForbiddenException } from '@nestjs/common';
import { TournamentRegistrationsService } from './tournament-registrations.service';
import { CreateTournamentRegistrationDto} from './dto/create-tournament-registrations.dto';
import { UpdateTournamentRegistrationDto } from './dto/update-tournament-registrations.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tournament-registrations')
export class TournamentRegistrationsController {
  constructor(private readonly registrationsService: TournamentRegistrationsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  register(
    @Request() req,
    @Body() createDto: CreateTournamentRegistrationDto,
  ) {
    return this.registrationsService.register(req.user.userId, createDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-registrations')
  findMyRegistrations(@Request() req) {
    return this.registrationsService.findByUser(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tournament/:tournamentId')
  findByTournament(@Param('tournamentId') tournamentId: number) {
    return this.registrationsService.findByTournament(tournamentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findById(@Param('id') id: number) {
    return this.registrationsService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  update(
    @Request() req,
    @Param('id') id: number,
    @Body() updateDto: UpdateTournamentRegistrationDto,
  ) {
    return this.registrationsService.update(req.user.userId, id, updateDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  cancel(@Request() req, @Param('id') id: number) {
    return this.registrationsService.cancel(req.user.userId, id);
  }
}