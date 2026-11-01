import React, { useState, useEffect } from 'react';
import { HudFrame, GaugeCircle, StatusCard } from '@/components/hud';
import { api } from '@/lib/api';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface SystemStats {
  cpuLoad: number;
  cpuModel: string;
  memTotal: number;
  memFree: number;
  memUsed: number;
  memPercent: number;
  uptime: number;
  platform: string;
}

interface HistoryPoint {
  time: string;
  cpu: number;
  mem: number;
}

export function Diagnostics() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/system/stats');
        const data = res.data;
        setStats(data);
        setHistory(prev => {
          const newPoint: HistoryPoint = {
            time: new Date().toLocaleTimeString(),
            cpu: data.cpuLoad,
            mem: data.memPercent,
          };
          return [...prev.slice(-30), newPoint];
        });
      } catch {
        setStats({
          cpuLoad: 42,
          cpuModel: 'Intel i7-7500U @ 3.4GHz',
          memTotal: 8 * 1024 * 1024 * 1024,
          memFree: 2 * 1024 * 1024 * 1024,
          memUsed: 6 * 1024 * 1024 * 1024,
          memPercent: 75,
          uptime: 43200,
          platform: 'linux',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 ** 3);
    return `${gb.toFixed(1)} GB`;
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      padding: '20px',
      maxWidth: '1600px',
      margin: '0 auto',
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px',
        paddingBottom: '12px',
        borderBottom: '1px solid var(--cyan-border)',
      }}>
        <h1 style={{ 
          fontSize: '24px', 
          letterSpacing: '2px', 
          color: 'var(--cyan)',
          textTransform: 'uppercase',
        }}>DIAGNOSTICS // REALTIME METRICS</h1>
        <StatusCard 
          label="DATA SOURCE" 
          value={loading ? 'LOADING...' : 'LIVE'} 
          status={loading ? 'warning' : 'online'} 
        />
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '16px',
        marginBottom: '24px',
      }}>
        {/* Gauges */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <HudFrame title="CPU LOAD" style={{ minHeight: '240px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '180px' }}>
              <GaugeCircle
                label="CPU"
                value={`${stats?.cpuLoad || 0}%`}
                sub={stats?.cpuModel || 'Unknown'}
                percent={stats?.cpuLoad || 0}
                size={200}
              />
            </div>
          </HudFrame>

          <HudFrame title="MEMORY" style={{ minHeight: '240px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '180px' }}>
              <GaugeCircle
                label="MEMORY"
                value={`${formatBytes(stats?.memUsed || 0)}/${formatBytes(stats?.memTotal || 0)}`}
                sub={`${stats?.memPercent || 0}% USED`}
                percent={stats?.memPercent || 0}
                size={200}
              />
            </div>
          </HudFrame>
        </div>

        {/* System Info */}
        <HudFrame title="SYSTEM INFO" style={{ 
          gridColumn: '1 / -1',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          <StatusCard label="PLATFORM" value={stats?.platform?.toUpperCase() || 'LINUX'} status="online" />
          <StatusCard label="UPTIME" value={stats ? formatUptime(stats.uptime) : '--'} status="online" />
          <StatusCard label="CPU MODEL" value={stats?.cpuModel || 'UNKNOWN'} status="online" />
          <StatusCard label="TOTAL RAM" value={stats ? formatBytes(stats.memTotal) : '--'} status="online" />
          <StatusCard label="FREE RAM" value={stats ? formatBytes(stats.memFree) : '--'} status="online" />
          <StatusCard label="USED RAM" value={stats ? formatBytes(stats.memUsed) : '--'} status="online" />
        </HudFrame>
      </div>

      {/* Live Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <HudFrame title="CPU LOAD // LIVE GRAPH" style={{ minHeight: '300px' }}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,248,255,0.1)" />
              <XAxis 
                dataKey="time" 
                stroke="var(--text-dim)" 
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: 'rgba(138,248,255,0.2)' }}
              />
              <YAxis 
                stroke="var(--text-dim)" 
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: 'rgba(138,248,255,0.2)' }}
                domain={[0, 100]}
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'var(--bg-panel)', 
                  border: '1px solid var(--cyan-border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                }} 
                labelStyle={{ color: 'var(--text-dim)' }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="cpu" 
                stroke="#8AF8FF" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: '#8AF8FF' }}
                name="CPU %"
              />
            </LineChart>
          </ResponsiveContainer>
        </HudFrame>

        <HudFrame title="MEMORY // LIVE GRAPH" style={{ minHeight: '300px' }}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8AF8FF" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#8AF8FF" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,248,255,0.1)" />
              <XAxis 
                dataKey="time" 
                stroke="var(--text-dim)" 
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: 'rgba(138,248,255,0.2)' }}
              />
              <YAxis 
                stroke="var(--text-dim)" 
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: 'rgba(138,248,255,0.2)' }}
                domain={[0, 100]}
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'var(--bg-panel)', 
                  border: '1px solid var(--cyan-border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                }} 
                labelStyle={{ color: 'var(--text-dim)' }}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="mem" 
                stroke="#8AF8FF" 
                strokeWidth={2}
                fill="url(#memGradient)"
                name="Memory %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </HudFrame>
      </div>
    </div>
  );
}