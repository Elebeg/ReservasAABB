import { Controller, Get, Post, Body, Param, Delete, Put, Request } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req, @Body() createReservationDto: CreateReservationDto) {
    return this.reservationsService.create(req.user, createReservationDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.reservationsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findUserReservations(@Request() req) {
    return this.reservationsService.findUserReservations(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(req.user, +id, updateReservationDto);
  }
  
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.reservationsService.remove(req.user, +id); 
  }
}