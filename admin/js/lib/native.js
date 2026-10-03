/* This project has no bundler -- every module here is loaded by the
   browser/webview exactly as written, the same convention shared/supabase.js
   already uses for supabase-js. Bare specifiers like `@capacitor/core`
   can't resolve without one, so every Capacitor import below is a full
   jsdelivr ESM URL, pinned to the exact version installed in package.json
   (see that file's own comment on why the pin matters: cap sync draws the
   native bridge runtime from the locally installed version, and loading a
   different version of the JS side here would be a real, if subtle,
   version-skew bug). Plugin modules are loaded lazily (dynamic import) so a
   plain desktop browser tab -- which will call none of them -- never
   fetches six plugin bundles it has no use for; @capacitor/core itself is
   small and needed for the platform check, so it loads eagerly. */
import { Capacitor } from 'https://cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm';

const PINNED = {
  camera: 'https://cdn.jsdelivr.net/npm/@capacitor/camera@8.2.5/+esm',
  share: 'https://cdn.jsdelivr.net/npm/@capacitor/share@8.0.3/+esm',
  filesystem: 'https://cdn.jsdelivr.net/npm/@capacitor/filesystem@8.1.4/+esm',
  haptics: 'https://cdn.jsdelivr.net/npm/@capacitor/haptics@8.0.2/+esm',
  statusBar: 'https://cdn.jsdelivr.net/npm/@capacitor/status-bar@8.0.4/+esm',
  geolocation: 'https://cdn.jsdelivr.net/npm/@capacitor/geolocation@8.2.3/+esm'
};

/** Single place every other file asks "are we native?" and reaches for a
 *  plugin -- so the platform check and the graceful-degradation behavior
 *  live in one spot instead of being re-decided at each call site. Every
 *  export here is safe to call from a plain browser tab: either Capacitor's
 *  own web implementation handles it, or this module catches the failure
 *  and falls back itself. Nothing here ever throws up to its caller.
 *
 *  Checked directly against the installed package versions (Capacitor 8.x)
 *  rather than assumed, since none of this can be exercised in a real
 *  native shell from this environment -- see the plugin-by-plugin notes
 *  below for what each one actually does on web today:
 *    - Geolocation, Share, Haptics ship real web implementations
 *      (Geolocation -> navigator.geolocation; Share -> navigator.share,
 *      itself not supported on every desktop browser; Haptics ->
 *      navigator.vibrate). Calling them is safe everywhere.
 *    - Camera's new (8.1+) takePhoto() is native-only in spirit -- its web
 *      path pops a live getUserMedia view, a different experience than
 *      this app's existing <input type=file capture> flow. This module
 *      only calls it when isNative() is true; web keeps the existing input.
 *    - StatusBar has NO web implementation at all and throws if called
 *      off-native, so every call here is isNative()-gated.
 */

export function isNative() {
  return Capacitor.isNativePlatform();
}

/** Haptics.impact() has a working web fallback (navigator.vibrate) and its
 *  web implementation never rejects, but this still swallows any error --
 *  a missed tactile buzz must never block the save it's celebrating. */
export async function hapticLight() {
  try {
    const { Haptics, ImpactStyle } = await import(PINNED.haptics);
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (err) { /* cosmetic only */ }
}

/** Native camera capture, converted to a plain File so every existing
 *  caller (offline queue, uploadJobPhoto, the photo-markup canvas) keeps
 *  working against the exact same type it already expects -- the native
 *  camera is just a different source for that File, not a parallel
 *  pipeline. Returns null if the user cancels or permission is denied,
 *  which callers treat the same as "no file chosen" from the web input. */
export async function takeNativePhoto() {
  try {
    const { Camera } = await import(PINNED.camera);
    const result = await Camera.takePhoto({ quality: 85, saveToGallery: false, correctOrientation: true });
    if (!result.webPath) return null;
    const blob = await (await fetch(result.webPath)).blob();
    const ext = (blob.type.split('/')[1] || 'jpeg').replace('jpeg', 'jpg');
    return new File([blob], `photo-${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' });
  } catch (err) {
    return null; // cancelled, denied, or not native -- caller's web path covers it
  }
}

/** Durable local backup of a full-resolution capture, written straight to
 *  the device's own sandboxed storage before the upload (queued or
 *  immediate) is even attempted -- so a capture survives the app being
 *  killed mid-upload, independent of the offline outbox's own IndexedDB
 *  storage. A no-op on web: the outbox's IndexedDB already holds the Blob
 *  there, and there is no equivalent native sandbox to write it to. */
export async function persistPhotoLocally(file) {
  if (!isNative()) return null;
  try {
    const { Filesystem, Directory } = await import(PINNED.filesystem);
    const base64 = await blobToBase64(file);
    const path = `nova-shield-photos/${Date.now()}-${file.name}`;
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true });
    return path;
  } catch (err) {
    return null; // best-effort durability layer -- never blocks the actual upload
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Native: the OS share sheet (iMessage/SMS/WhatsApp/Mail/AirPrint, per
 *  device). Browser with Web Share support: the same sheet via
 *  navigator.share. Neither available (most desktop browsers): runs
 *  fallbackFn instead -- e.g. this app's existing clipboard copy. Returns
 *  true if a share sheet was actually shown, false if it fell back. */
export async function shareOrFallback({ title, text, url }, fallbackFn) {
  try {
    const { Share } = await import(PINNED.share);
    await Share.share({ title, text, url, dialogTitle: title });
    return true;
  } catch (err) {
    await fallbackFn();
    return false;
  }
}

/** Shares the CURRENT document exactly as it stands right now -- callers
 *  only call this from a page that has already finished rendering (e.g. a
 *  report's own "Print" button, after its data has loaded), so the
 *  snapshot is real content, not the empty pre-render shell a page would
 *  show if someone fetched its URL cold. Used in place of window.print()
 *  on native, where there is no OS print sheet to hand a document to --
 *  the share sheet (Mail/Messages/AirDrop/"Save to Files", per device) is
 *  this platform's equivalent of "print / save as PDF". Resolves false on
 *  any failure, native-unsupported or otherwise, so the caller can fall
 *  back to window.print() same as it always has. */
export async function shareCurrentPage({ fileName, title }) {
  if (!isNative()) return false;
  try {
    const { Filesystem, Directory } = await import(PINNED.filesystem);
    const { Share } = await import(PINNED.share);
    const base64 = await blobToBase64(new Blob([document.documentElement.outerHTML], { type: 'text/html' }));
    await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache, recursive: true });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await Share.share({ title, url: uri, dialogTitle: title });
    return true;
  } catch (err) {
    return false;
  }
}

/** Resolves to {latitude, longitude} or null -- permission denial, a
 *  disabled location service, or simply not being asked (desktop admin)
 *  are all the same "we don't know where the device is" to every caller,
 *  never an exception to handle. */
export async function getDevicePosition() {
  try {
    const { Geolocation } = await import(PINNED.geolocation);
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch (err) {
    return null;
  }
}

/** Status bar styling has no web implementation at all in this plugin --
 *  calling it off-native throws, so it is skipped outright rather than
 *  caught, same effect either way but clearer about why. */
export async function setStatusBarTheme() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import(PINNED.statusBar);
    await StatusBar.setBackgroundColor({ color: '#0f172a' });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (err) { /* cosmetic only */ }
}
