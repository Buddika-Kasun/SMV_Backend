import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ok } from '../../common/response';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin', 'manager')
  async list() {
    return ok(await this.usersService.findAll(), 'Users retrieved');
  }

  @Post()
  @Roles('admin', 'manager')
  async create(@Body() body: CreateUserDto) {
    const user = await this.usersService.create(body);
    return { success: true, message: 'User created', data: user, timestamp: new Date().toISOString() };
  }

  @Put(':id')
  @Roles('admin', 'manager')
  async update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return ok(await this.usersService.update(id, body), 'User updated');
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(200)
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return ok(null, 'User deleted');
  }

  @Post('reset-defaults')
  @Roles('admin')
  async resetDefaults() {
    return ok(await this.usersService.resetDefaults(), 'User store reset to default baseline');
  }
}