import axios from 'axios';

export const worldApi = {
  flights: async () => {
    try {
      const res = await axios.get('/api/world/flights');
      return res.data;
    } catch {
      const res = await axios.get('https://api.adsb.lol/v2/all');
      return res.data;
    }
  },
  quakes: async () => {
    try {
      const res = await axios.get('/api/world/quakes');
      return res.data;
    } catch {
      const res = await axios.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
      return res.data;
    }
  },
};
