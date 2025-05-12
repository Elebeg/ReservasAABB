import { Controller, Get, Post, Body, Param, Delete, Put, Request, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
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
  findMine(@Request() req) {
    return this.reservationsService.findByUser(req.user.userId);
  }
  
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  updateReservationDate(@Param('id') id: number, @Request() req, @Body('startTime') startTime: Date) {
    return this.reservationsService.updateDate(req.user.userId, id, startTime);
  }
  
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteReservation(@Param('id') id: number, @Request() req) {
    return this.reservationsService.deleteByUser(req.user.userId, id);
  }
}