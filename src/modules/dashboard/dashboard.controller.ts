import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ok } from "../../common/response";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { DashboardService } from "./dashboard.service";
import { SearchLoansDto } from "./dto/search-loans.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthedUser } from "../../common/guards/auth.types";

@ApiTags("Dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("header")
  @ApiOperation({
    summary: "Get header stats",
    description:
      "Lightweight stats for the app header: total disbursed amount and total outstanding.",
  })
  @ApiOkResponse({
    description: "Returns `{ totalDisbursedAmount, totalOutstanding }`.",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async getHeader(
    @CurrentUser() auth: AuthedUser
  ) {
    return ok(
      await this.dashboardService.getHeader(auth),
      "Header stats retrieved",
    );
  }

  @Get("search")
  @ApiQuery({
    name: "q",
    required: true,
    type: String,
    description:
      "Search term — matches customer name, NIC, phone, loan number, or account number.",
    example: "Silva",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    example: 8,
    description: "Max results to return (default 8, max 50).",
  })
  @ApiOperation({
    summary: "Quick search across loans",
    description:
      "Lightweight endpoint for the global search bar. Returns a small, trimmed payload.",
  })
  @ApiOkResponse({
    description: "Returns an array of matching loans (trimmed fields only).",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async search(@Query() query: SearchLoansDto) {
    return ok(
      await this.dashboardService.search(query.q ?? "", query.limit ?? 8),
      "Search results retrieved",
    );
  }

  @Get("navigation-counts")
  @ApiOperation({
    summary: "Get navigation badge counts",
    description:
      "Returns counts for sidebar badges: pending approvals, pending KYC (KYC + pending disbursement), and overdue loans.",
  })
  @ApiOkResponse({
    description: "Returns `{ pendingApproval, pendingKyc, overdue }`.",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async getNavigationCounts() {
    return ok(
      await this.dashboardService.getNavigationCounts(),
      "Navigation counts retrieved",
    );
  }

  @Get()
  @Roles("admin", "manager")
  @ApiOperation({
    summary: "Get full dashboard",
    description: "Portfolio metrics, pending actions, and latest 10 loans.",
  })
  @ApiOkResponse({
    description: "Returns aggregated stats and latest loans.",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async getDashboard() {
    return ok(
      await this.dashboardService.getDashboard(),
      "Dashboard data retrieved",
    );
  }
}
