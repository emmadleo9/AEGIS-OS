import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AegisApp from './AegisApp';
import './styles/aegis-hud.css';
import 'maplibre-gl/dist/maplibre-gl.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AegisApp /></StrictMode>);
