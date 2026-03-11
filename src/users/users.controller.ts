import { Controller, Get, Param, Request, UseGuards, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../admin/admin-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Somente admins podem listar todos os usuários
  @UseGuards(AdminAuthGuard)
  @Get()
  async findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string) {
    const user = await this.usersService.findById(Number(id));
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }
}
