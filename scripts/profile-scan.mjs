/** Dump each Chrome profile's stored account emails from Preferences (read-only, no password extraction). */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const base = 'C:/Users/User/AppData/Local/Google/Chrome/User Data';
for (const dir of readdirSync(base)) {
  if (!/^Profile \d+$|^Default$/.test(dir)) continue;
  const prefsPath = join(base, dir, 'Preferences');
  if (!existsSync(prefsPath)) continue;
  try {
    const prefs = JSON.parse(readFileSync(prefsPath, 'utf8'));
    const name = prefs.profile?.name ?? '';
    const emails = (prefs.account_info ?? []).map((a) => a.email).filter(Boolean);
    const gaia = (prefs.profile?.gaia_info_hash_url ?? '');
    console.log(`${dir.padEnd(12)} name=${JSON.stringify(name).padEnd(24)} accounts=${emails.join(', ') || '(none recorded)'}`);
  } catch (error) {
    console.log(`${dir} unreadable: ${error.message.slice(0, 40)}`);
  }
}
