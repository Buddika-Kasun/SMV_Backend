import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Exchange username/password credentials for an access + refresh token pair.
   * Public endpoint - no bearer token required.
   */
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Authenticate a user and issue access + refresh tokens',
    description:
      'Validates the credentials against an active user account. Returns a short-lived `accessToken` for API calls, ' +
      'a long-lived `refreshToken` for `POST /api/auth/refresh`, plus the public user profile.',
  })
  @ApiOkResponse({
    description:
      'Authentication successful. Returns `accessToken`, `refreshToken`, ' +
      'and the public `user` object (password hash omitted).',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid username or password, or the account is inactive.',
  })
  async login(@Body() body: LoginDto) {
    return ok(
      await this.authService.login(body),
      "Login successfull",
    );
  }

  /**
   * Trade a valid refresh token for a freshly-signed token pair.
   * Public endpoint - the refresh token itself authenticates the call.
   */
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new access + refresh pair',
    description:
      'Public endpoint. Verifies the long-lived refresh token (signed with the separate refresh secret), confirms the ' +
      'account still exists and is active, then issues a fresh `accessToken` and a rotated `refreshToken`. Access ' +
      'tokens are rejected here.',
  })
  @ApiOkResponse({
    description:
      'New tokens issued. Response shape mirrors the login payload: `accessToken`, rotated `refreshToken`, ' +
      'and the public `user` object.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Refresh token missing/malformed, expired, not a refresh token, or the account no longer exists / is inactive.',
  })
  @ApiBadRequestResponse({ description: 'Request body failed validation.' })
  async refresh(@Body() body: RefreshTokenDto) {
    return ok(
      await this.authService.refresh(body.refreshToken),
      "Token refreshed",
    );
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