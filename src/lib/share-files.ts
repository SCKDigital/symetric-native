import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// Data exports and PDF reports are health data written to disk only so the
// share sheet has a file to hand over. They used to stay in the cache
// directory indefinitely, surviving sign-out and account deletion. Everything
// shared now lives in one folder that clearShareFiles() empties: before each
// new export or report, at launch, and at sign-out.
//
// Not deleted straight after the share sheet closes: on Android the receiving
// app (Drive, a mail draft) can still be reading the file after control
// comes back here.

function shareDir(): Directory {
  return new Directory(Paths.cache, 'shared-exports');
}

/** Writes `content` to a fresh file in the share folder and returns its uri. */
export function writeShareFile(name: string, content: string): string {
  const file = new File(shareDir(), name);
  file.create({ intermediates: true, overwrite: true });
  file.write(content);
  return file.uri;
}

/** Moves a file another API wrote (expo-print's PDF) into the share folder,
 *  so it is cleared with the rest. Returns the new uri. */
export function adoptShareFile(uri: string, name: string): string {
  if (Platform.OS === 'web') return uri;
  const dir = shareDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(uri);
  file.moveSync(new File(dir, name), { overwrite: true });
  return file.uri;
}

/** Deletes everything previously written for sharing. Never throws. */
export function clearShareFiles(): void {
  if (Platform.OS === 'web') return;
  try {
    const dir = shareDir();
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('[share-files] clear failed:', e);
  }
}
