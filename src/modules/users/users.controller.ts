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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ok } from '../../common/response';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * All endpoints require a valid JWT; most additionally require the
 * `admin` or `manager` role (enforced by {@link RolesGuard}).
 */
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'List all users',
    description: 'Requires role: `admin` or `manager`.',
  })
  @ApiOkResponse({
    description: 'Standard envelope whose `data` holds the array of users (password hashes omitted).',
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to list users.' })
  async list() {
    return ok(await this.usersService.findAll(), 'Users retrieved');
  }

  @Post()
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Create a new user account',
    description: 'Requires role: `admin` or `manager`. Usernames are unique across the platform.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully; returns the created user without its password hash.',
  })
  @ApiBadRequestResponse({ description: 'Request body failed validation.' })
  @ApiConflictResponse({ description: "The chosen username is already taken." })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to create users.' })
  async create(@Body() body: CreateUserDto) {
    const user = await this.usersService.create(body);
    return { success: true, message: 'User created', data: user, timestamp: new Date().toISOString() };
  }

  @Put(':id')
  @Roles('admin', 'manager')
  @ApiParam({ name: 'id', description: 'ID of the user to update', example: 'clx...' })
  @ApiOperation({
    summary: 'Update an existing user',
    description:
      'Partially updates the user identified by `id`. Requires role: `admin` or `manager`. ' +
      'Only supplied fields are changed; promoting a second active admin is rejected by business rule.',
  })
  @ApiOkResponse({ description: 'User updated successfully.' })
  @ApiBadRequestResponse({ description: 'Request body failed validation or violates the single-active-admin rule.' })
  @ApiNotFoundResponse({ description: 'No user exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to update users.' })
  async update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return ok(await this.usersService.update(id, body), 'User updated');
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(200)
  @ApiParam({ name: 'id', description: 'ID of the user to delete', example: 'clx...' })
  @ApiOperation({
    summary: 'Delete a user account',
    description: 'Requires role: `admin`. Deleting the last active admin account is rejected.',
  })
  @ApiOkResponse({ description: 'User deleted successfully (`data` is null).' })
  @ApiBadRequestResponse({ description: 'Attempted to delete the last active admin account.' })
  @ApiNotFoundResponse({ description: 'No user exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Only `admin` may delete users.' })
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return ok(null, 'User deleted');
  }

  @Post('reset-defaults')
  @Roles('admin')
  @ApiOperation({
    summary: 'Reset the user store to the default baseline',
    description:
      'Requires role: `admin`. Wipes current accounts and re-seeds the shipped default users.',
  })
  @ApiCreatedResponse({
    description: 'User store reset successfully; `data` lists the restored baseline users.',
  })
  @ApiBadRequestResponse({ description: 'A default admin conflicts with the single-active-admin rule.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Only `admin` may reset the user store.' })
  async resetDefaults() {
    return ok(await this.usersService.resetDefaults(), 'User store reset to default baseline');
  }
}