import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthedUser, AUTH_HEADER, BEARER_PREFIX } from "./auth.types";

/**
 * Verifies the JWT and attaches the parsed payload to `request.user`.
 *
 * Reads the token from (in order):
 *   1. `Authorization: Bearer <token>` header — the normal path
 *   2. `?token=<token>` query param — required for SSE, since browser
 *      EventSource cannot set custom headers
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const req = executionContext
      .switchToHttp()
      .getRequest<Request & { user?: AuthedUser; query?: any }>();

    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException("Authentication token missing");
    }

    try {
      const payload = this.jwtService.verify(token);
      req.user = payload as unknown as AuthedUser;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  /**
   * Prefer the Authorization header; fall back to `?token=` query param.
   * The header check is case-insensitive for robustness — some proxies
   * normalize `Authorization` to lowercase.
   */
  private extractToken(req: Request & { query?: any }): string | null {
    // 1. Standard header
    const auth =
      (req.headers as any)[AUTH_HEADER] ??
      (req.headers as any)["authorization"] ??
      (req.headers as any)["Authorization"];

    if (auth && typeof auth === "string" && auth.startsWith(BEARER_PREFIX)) {
      return auth.slice(BEARER_PREFIX.length).trim();
    }

    // 2. Query param fallback (SSE only)
    const q = req.query?.token;
    if (typeof q === "string" && q.length > 0) {
      return q;
    }

    return null;
  }
}
