import { useCallback, useEffect, useMemo, useState } from 'react';
import { HudFrame } from '@/components/hud';

type TaskRow = { pid: number; name: string; cpu: number; memory: number; memMb: number; status: string; user: string };
type TasksPayload = { processes: TaskRow[]; total: number; cpuTotal: number; memUsedGb: number; memTotalGb: number; updatedAt: string };
type DeviceEntry = { id: string; platform: string };
type SortKey = 'cpu' | 'memory' | 'name' | 'pid';

export function TaskControlCenter() {
  const [tasks, setTasks] = useState<TasksPayload | null>(null);
  const [tab, setTab] = useState<'LAPTOP' | 'PHONE'>('LAPTOP');
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [deviceTasks, setDeviceTasks] = useState<TaskRow[]>([]);
  const [activeDevice, setActiveDevice] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [query, setQuery] = useState('');
  const [confirmPid, setConfirmPid] = useState<number | null>(null);
  const [error, setError] = useState('');

  const loadLaptop = useCallback(async () => {
    try {
      const response = await fetch('/api/system-tasks', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setTasks(await response.json() as TasksPayload);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    void loadLaptop();
    const timer = window.setInterval(() => void loadLaptop(), 3000);
    return () => window.clearInterval(timer);
  }, [loadLaptop]);

  useEffect(() => {
    void fetch('/api/system-tasks/devices').then((response) => response.json())
      .then((data: { devices?: DeviceEntry[] }) => setDevices(data.devices ?? []))
      .catch(() => setDevices([]));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'PHONE' || !activeDevice) return;
    const load = () => void fetch(`/api/system-tasks/device/${encodeURIComponent(activeDevice)}`).then((response) => response.json())
      .then((data: { processes?: TaskRow[] }) => setDeviceTasks(data.processes ?? []))
      .catch(() => setDeviceTasks([]));
    void load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [activeDevice, tab]);

  const rows = tab === 'LAPTOP' ? tasks?.processes ?? [] : deviceTasks;
  const visible = useMemo(() => {
    const filtered = query
      ? rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()) || String(row.pid).includes(query))
      : rows;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'pid') return a.pid - b.pid;
      return (b[sortKey] ?? 0) - (a[sortKey] ?? 0);
    });
    return sorted.slice(0, 120);
  }, [query, rows, sortKey]);

  const kill = async (pid: number) => {
    setConfirmPid(null);
    try {
      await fetch('/api/system-tasks/kill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid }) });
      await loadLaptop();
    } catch {
      /* gateway surfaces errors via next refresh */
    }
  };

  return (
    <HudFrame title="AEGIS TASK CONTROL CENTER">
      <div className="task-toolbar">
        {(['LAPTOP', 'PHONE'] as const).map((item) => (
          <button type="button" key={item} className={tab === item ? 'device-tab active' : 'device-tab'} onClick={() => setTab(item)}>{item}</button>
        ))}
        <input aria-label="Filter processes" className="task-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by name or PID…" />
        {(['cpu', 'memory', 'name'] as SortKey[]).map((key) => (
          <button type="button" key={key} className={sortKey === key ? 'device-tab active' : 'device-tab'} onClick={() => setSortKey(key)}>
            SORT {key.toUpperCase()}
          </button>
        ))}
        {tasks && <span className="task-stat">{tasks.cpuTotal}% CPU · {tasks.memUsedGb}/{tasks.memTotalGb} GB RAM · {tasks.total} PROCS</span>}
      </div>

      {tab === 'PHONE' && (
        <div className="task-toolbar">
          {devices.length === 0 && <span className="inline-status">No ADB devices detected — connect an Android phone with USB debugging.</span>}
          {devices.map((device) => (
            <button type="button" key={device.id} className={activeDevice === device.id ? 'device-tab active' : 'device-tab'} onClick={() => setActiveDevice(device.id)}>
              {device.id}
            </button>
          ))}
        </div>
      )}

      {error && <p className="inline-status" style={{ color: '#ff8792' }}>Task feed: {error}</p>}

      <div className="task-table-wrap">
        <table className="task-table">
          <thead>
            <tr><th>PID</th><th>NAME</th><th>CPU%</th><th>MEM%</th><th>MEM MB</th><th>STATUS</th><th /></tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.pid}-${row.name}`}>
                <td>{row.pid}</td>
                <td className="task-name">{row.name}</td>
                <td>{row.cpu}</td>
                <td>{row.memory}</td>
                <td>{row.memMb || '—'}</td>
                <td>{row.status}</td>
                <td>
                  {tab === 'LAPTOP' && (confirmPid === row.pid
                    ? <>
                      <button type="button" className="hud-button task-kill" onClick={() => void kill(row.pid)}>CONFIRM</button>
                      <button type="button" className="hud-button" onClick={() => setConfirmPid(null)}>×</button>
                    </>
                    : <button type="button" className="hud-button" onClick={() => setConfirmPid(row.pid)}>KILL</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && !error && <p className="inline-status">No processes match this filter.</p>}
      </div>
    </HudFrame>
  );
}
