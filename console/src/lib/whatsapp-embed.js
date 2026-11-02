export function getWaLink(lat, lng) {
  return `https://wa.me/?text=Check%20sat%20loc%20${lat},${lng}`;
}

export async function sendLocation(client, chatId, lat, lng) {
  const link = getWaLink(lat, lng);
  if (client && typeof client.sendMessage === 'function') {
    return client.sendMessage(chatId, link);
  }
  return Promise.resolve({ link, chatId, lat, lng, sent: false, reason: 'no-client' });
}
