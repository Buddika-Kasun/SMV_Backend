import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Injects the authenticated user JWT payload (set by JwtAuthGuard) into a
 * handler argument.
 * e.g. async me(@CurrentUser() user: AuthedUser)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    return (ctx.switchToHttp().getRequest() as any).user;
  },
);