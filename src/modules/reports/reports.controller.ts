import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
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