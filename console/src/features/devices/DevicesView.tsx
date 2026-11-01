import { useState } from 'react';
import { HudFrame } from '@/components/hud';

type DeviceTab = 'WIRED' | 'WIRELESS' | 'BLUETOOTH' | 'USB';
type DeviceRow = { id: string; name: string; detail: string; status: string };
type BluetoothDevice = { id: string; name?: string; gatt?: { connected?: boolean } };
type UsbDevice = { productName?: string; manufacturerName?: string; serialNumber?: string };
type SerialPort = object;
type DeviceNavigator = Navigator & {
  bluetooth?: { requestDevice: (options: { acceptAllDevices: true }) => Promise<BluetoothDevice> };
  usb?: { getDevices: () => Promise<UsbDevice[]> };
  serial?: { getPorts: () => Promise<SerialPort[]> };
};
type NetworkInterface = { iface: string; type: string; ip4: string; operstate: string; speed: number };

const tabs: DeviceTab[] = ['WIRED', 'WIRELESS', 'BLUETOOTH', 'USB'];

export function DevicesView() {
  const [tab, setTab] = useState<DeviceTab>('WIRED');
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [message, setMessage] = useState('Choose a scan method. Browser scans only return devices you explicitly authorize.');
  const [busy, setBusy] = useState(false);

  const scanNetwork = async (type: 'wired' | 'wireless') => {
    const response = await fetch('/api/network-scan', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Gateway returned HTTP ${response.status}`);
    const result = await response.json() as { interfaces: NetworkInterface[] };
    const interfaces = result.interfaces.filter((network) => network.type.toLowerCase() === type && network.ip4 && network.ip4 !== '0.0.0.0');
    setDevices(interfaces.map((network) => ({
      id: network.iface,
      name: network.iface,
      detail: `${network.ip4} · ${network.speed || '—'} Mbps`,
      status: network.operstate.toUpperCase(),
    })));
    setMessage(interfaces.length ? `LOCAL ${type.toUpperCase()} INTERFACES` : `NO ACTIVE ${type.toUpperCase()} INTERFACES REPORTED`);
  };

  const scanBrowserDevices = async (kind: 'bluetooth' | 'usb') => {
    const deviceNavigator = navigator as DeviceNavigator;
    if (kind === 'bluetooth') {
      if (!deviceNavigator.bluetooth) throw new Error('Web Bluetooth is unavailable in this browser or context.');
      const device = await deviceNavigator.bluetooth.requestDevice({ acceptAllDevices: true });
      setDevices([{ id: device.id, name: device.name || 'Unnamed Bluetooth device', detail: 'Selected with browser permission', status: device.gatt?.connected ? 'CONNECTED' : 'AUTHORIZED' }]);
      setMessage('BLUETOOTH DEVICE SELECTED BY USER');
      return;
    }

    if (!deviceNavigator.usb && !deviceNavigator.serial) throw new Error('WebUSB and Web Serial are unavailable in this browser.');
    const [usbDevices, serialPorts] = await Promise.all([
      deviceNavigator.usb?.getDevices() ?? Promise.resolve([]),
      deviceNavigator.serial?.getPorts() ?? Promise.resolve([]),
    ]);
    const rows = usbDevices.map((device, index) => ({
      id: `usb-${device.serialNumber || index}`,
      name: [device.manufacturerName, device.productName].filter(Boolean).join(' ') || 'Authorized USB device',
      detail: device.serialNumber ? `Serial ${device.serialNumber}` : 'USB permission previously granted',
      status: 'AUTHORIZED',
    }));
    serialPorts.forEach((_, index) => rows.push({ id: `serial-${index}`, name: `Authorized serial port ${index + 1}`, detail: 'Web Serial permission previously granted', status: 'AUTHORIZED' }));
    setDevices(rows);
    setMessage(`${rows.length} PREVIOUSLY AUTHORIZED USB / SERIAL DEVICES`);
  };

  const runScan = async () => {
    setBusy(true);
    setDevices([]);
    try {
      if (tab === 'WIRED' || tab === 'WIRELESS') await scanNetwork(tab.toLowerCase() as 'wired' | 'wireless');
      else await scanBrowserDevices(tab.toLowerCase() as 'bluetooth' | 'usb');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="devices-page">
      <div className="device-tabs" role="tablist" aria-label="Device category">
        {tabs.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'device-tab active' : 'device-tab'} onClick={() => { setTab(item); setDevices([]); }}>
            {item}
          </button>
        ))}
        <button type="button" className="hud-button device-scan-button" onClick={() => void runScan()} disabled={busy}>
          {busy ? 'SCANNING…' : `SCAN ${tab}`}
        </button>
      </div>
      <div className="device-grid">
        {devices.map((device) => (
          <HudFrame key={device.id} title={tab}>
            <div className="device-card-name">{device.name}</div>
            <div className="device-card-detail">{device.detail}</div>
            <div className="device-card-status"><span className="status-dot" />{device.status}</div>
          </HudFrame>
        ))}
        {devices.length === 0 && (
          <HudFrame title={`${tab} SCAN`}>
            <p className="inline-status">{message}</p>
            {(tab === 'BLUETOOTH' || tab === 'USB') && <p className="scope-copy">Device discovery is permission-gated by the browser. No device is enumerated without user consent.</p>}
          </HudFrame>
        )}
      </div>
    </div>
  );
}
