import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import KrynaraApp from './KrynaraApp';
import './lib/firebase';
import './styles/krynara-hud.css';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(maplibreWorkerUrl);

createRoot(document.getElementById('root')!).render(<StrictMode><KrynaraApp /></StrictMode>);
