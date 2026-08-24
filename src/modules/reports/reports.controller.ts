import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Compute the portfolio summary',
    description:
      'Aggregates portfolio-wide metrics (loan book totals, loan status breakdown, collections, ' +
      'consultancy exposure, etc.) for dashboards.',
  })
  @ApiOkResponse({
    description: 'Standard envelope whose `data` holds the aggregated summary metrics.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async summary() {
    const summary = await this.reportsService.summary();
    return {
      success: true,
      message: 'Portfolio summary computed',
      summary,
      timestamp: new Date().toISOString(),
    };
  }
}