import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { SkipThrottle } from '@nestjs/throttler';
import * as os from 'os';

@ApiTags('system')
@Controller('system')
@Public()
@SkipThrottle()
export class SystemController {
  @Get('stats')
  @ApiOperation({ summary: 'Get system statistics' })
  @ApiResponse({ status: 200, description: 'System statistics' })
  getStats() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    // Calculate CPU load average (normalized for single core display)
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuLoad = Math.min(Math.round((loadAvg / cpuCount) * 100), 100);

    return {
      cpuLoad,
      cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
      memTotal: totalMem,
      memFree: freeMem,
      memUsed: usedMem,
      memPercent,
      uptime: Math.floor(os.uptime()),
      platform: os.platform(),
    };
  }
}
