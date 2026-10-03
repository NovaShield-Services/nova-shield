import * as api from '../lib/api.js';
import { el, clear, toast, select, confirmAction } from '../../../shared/dom.js';
import { isNative, takeNativePhoto, persistPhotoLocally } from '../lib/native.js';
import { openPhotoMarkup } from '../components/photo-markup.js';

const TAGS = [
  { value: 'before',      label: 'Before' },
  { value: 'after',       label: 'After' },
  { value: 'damage',      label: 'Damage / Issue' },
  { value: 'measurement', label: 'Measurement / Scope' },
  { value: 'site_photo',  label: 'General' }
];

/** Photo documentation for a job. Private by default (customer_visible
 *  defaults false on the row; nothing in the customer-facing quote page
 *  reads job_attachments at all, so there is no path for one of these to
 *  reach a customer until that is deliberately built) -- a photo can be
 *  marked for inclusion in a customer report, but that is a flag on the
 *  record, not a delivery mechanism yet. */
export function createPhotosPanel({ jobId, uploadFn }) {
  const root = el('div', { class: 'card' });
  // Desktop uploads directly (always online). The field console passes a
  // wrapped version that goes through its offline outbox instead -- it
  // returns true when the upload was queued rather than completed, so the
  // list below is skipped (there is nothing new to show yet) instead of
  // silently re-rendering as if nothing happened.
  const upload = uploadFn || (async (jid, file, opts) => {
    await api.uploadJobPhoto(jid, file, opts); toast('Photo added'); return false;
  });

  let pendingTag = 'site_photo';
  let pendingElevation = '';

  const fileInput = el('input', {
    type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none'
  });

  // Shared tail end of both capture paths (native camera and the web file
  // input): offer the markup pass, then feed the result into the same
  // upload/offline-queue call that was already here.
  async function commitPhoto(file) {
    const marked = await openPhotoMarkup(file);
    try {
      const queued = await upload(jobId, marked, {
        kind: pendingTag, elevationTag: pendingElevation.trim() || undefined
      });
      if (!queued) await render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    await commitPhoto(file);
  });

  // Native: <input capture> opens a bare OS camera view with no way back
  // into this component's own flow, so native bypasses the file input
  // entirely and calls the Camera plugin directly, which hands back a real
  // File the same as the input's change event would have.
  async function addPhoto() {
    if (!isNative()) { fileInput.click(); return; }
    const file = await takeNativePhoto();
    if (!file) return; // cancelled from the native camera UI
    await persistPhotoLocally(file); // best-effort local durability, never blocks the upload
    await commitPhoto(file);
  }

  function tagLabel(kind) {
    return TAGS.find(t => t.value === kind)?.label || kind;
  }

  function photoTile(photo) {
    const tile = el('div', { class: 'photo-grid__tile' });
    tile.append(el('span', { class: 'hint', style: 'display:flex;align-items:center;justify-content:center;height:100%;font-size:.7rem', text: '…' }));

    api.signedPhotoUrl(photo.storage_path, 900, 'job-photos').then(url => {
      clear(tile).append(
        el('img', { src: url, alt: photo.caption || tagLabel(photo.kind) }),
        el('span', { class: 'photo-grid__tag',
          text: photo.elevation_tag ? `${tagLabel(photo.kind)} · ${photo.elevation_tag}` : tagLabel(photo.kind) })
      );
    }).catch(() => {
      clear(tile).append(el('span', { class: 'hint',
        style: 'display:flex;align-items:center;justify-content:center;height:100%;text-align:center;font-size:.72rem;padding:4px',
        text: 'Preview unavailable' }));
    });

    tile.addEventListener('click', async () => {
      if (!confirmAction('Remove this photo?')) return;
      try {
        await api.deleteAttachment(photo.id);
        await render();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    return tile;
  }

  async function render() {
    const photos = await api.listAttachments(jobId);
    // request-photos (customer uploads) and job-photos (staff-captured) both
    // write to job_attachments -- only the ones this panel itself can
    // manage (job-photos, i.e. not a raw customer_upload) are shown here as
    // deletable staff photos; customer uploads stay in the existing
    // "Photos" card on the desktop job view.
    const staffPhotos = photos.filter(p => p.kind !== 'customer_upload');

    const tagSelect = select(TAGS, pendingTag, (e) => { pendingTag = e.target.value; });
    const elevationInput = el('input', {
      placeholder: 'Elevation, e.g. "North Rear" (optional)',
      onChange: (e) => { pendingElevation = e.target.value; }
    });
    elevationInput.value = pendingElevation;

    // Element.append() stringifies a bare null/undefined argument into the
    // literal text "null" -- harmless-looking in review, visible as soon as
    // there are zero photos, so the empty-grid branch is filtered out
    // rather than passed straight through.
    clear(root).append(...[
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Photos' }),
          el('p', { text: staffPhotos.length ? `${staffPhotos.length} attached` : 'None yet — tap to add one.' })
        ])
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Tag' }), tagSelect]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Elevation' }), elevationInput])
      ]),
      el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
        el('button', { class: 'btn btn--primary', text: '+ Add photo', onClick: addPhoto }),
        fileInput
      ]),
      staffPhotos.length
        ? el('div', { class: 'photo-grid', style: 'margin-top:12px' }, staffPhotos.map(photoTile))
        : null,
      el('p', { class: 'hint', style: 'margin-top:10px',
        text: 'Private to staff by default. Tap a photo to remove it.' })
    ].filter(Boolean));
  }

  return { root, render };
}
