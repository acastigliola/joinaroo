// Local event saves (POC). Single test user: slugs persist on-device.
// When user accounts land, this becomes server-side keyed by session.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sme:saved-slugs:v1';

async function readSlugs(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export async function getSavedSlugs(): Promise<string[]> {
  return readSlugs();
}

export async function isSaved(slug: string): Promise<boolean> {
  return (await readSlugs()).includes(slug);
}

/** Toggle a save. Returns the new saved state. */
export async function toggleSaved(slug: string): Promise<boolean> {
  const slugs = await readSlugs();
  const idx = slugs.indexOf(slug);
  if (idx >= 0) {
    slugs.splice(idx, 1);
  } else {
    slugs.push(slug);
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(slugs));
  return idx < 0;
}
