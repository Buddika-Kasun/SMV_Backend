import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthedUser } from '../../common/guards/auth.types';
import { ok } from '../../common/response';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto) {
    const { token, user } = await this.authService.login(body);
    return {
      success: true,
      message: 'Authentication successful',
      token,
      user,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() authUser: AuthedUser) {
    return ok(await this.authService.me(authUser.sub), 'Authenticated user metadata');
  }
}