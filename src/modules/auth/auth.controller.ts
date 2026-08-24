import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthedUser } from '../../common/guards/auth.types';
import { ok } from '../../common/response';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Exchange username/password credentials for a signed JWT.
   * Public endpoint - no bearer token required.
   */
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Authenticate a user and issue a JWT access token',
    description:
      'Validates the credentials against an active user account and returns a signed JWT alongside the public user profile.',
  })
  @ApiOkResponse({
    description:
      'Authentication successful. Returns `token` together with the public `user` object (password hash omitted).',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid username or password, or the account is inactive.',
  })
  async login(@Body() body: LoginDto) {
    const { token, user } = await this.authService.login(body);
    return {
      success: true,
      message: 'Authentication successful',
      token,
      user,
    };
  }

  /** Profile metadata for the user identified by the presented bearer token. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Return the authenticated user's profile",
    description:
      'Resolves the JWT subject (`sub`) back to the stored user record.',
  })
  @ApiOkResponse({
    description: 'Standard envelope whose `data` holds the public user profile.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authorization header missing/malformed, or the token is invalid or expired.',
  })
  @ApiNotFoundResponse({
    description: 'The token subject no longer maps to an existing user.',
  })
  async me(@CurrentUser() authUser: AuthedUser) {
    return ok(await this.authService.me(authUser.sub), 'Authenticated user metadata');
  }
}