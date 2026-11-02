/** Weather service — Open-Meteo primary, OWM layers via gateway, offline mock fallback. */
import { safeFetch } from './offlineFetch';

export type WeatherNow = { temperature: number; wind: number; humidity: number; pressure: number };
const MOCK: WeatherNow = { temperature: 24, wind: 12, humidity: 48, pressure: 1012 };

export async function getWeather(latitude: number, longitude: number) {
  const result = await safeFetch<WeatherNow>(`/api/weather?latitude=${latitude}&longitude=${longitude}`, MOCK);
  return {
    ...result,
    data: {
      temperature: result.data?.current?.temperature_2m ?? MOCK.temperature,
      wind: result.data?.current?.wind_speed_10m ?? MOCK.wind,
      humidity: result.data?.current?.relative_humidity_2m ?? MOCK.humidity,
      pressure: result.data?.current?.surface_pressure ?? MOCK.pressure,
    } as WeatherNow,
  };
}

export async function getWeatherTileUrl(layer: string): Promise<string | null> {
  const result = await safeFetch<{ tileUrl?: string }>(`/api/weather-tiles/${layer}`, {});
  return result.offline ? null : result.data.tileUrl ?? null;
}
