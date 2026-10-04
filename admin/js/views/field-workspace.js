import * as api from '../lib/api.js';
import { el, clear, toast, select, confirmAction } from '../../../shared/dom.js';
import { humanise } from '../../../shared/format.js';
import { createMeasurementsPanel } from './measurements.js';
import { createQuotePanel } from './quote.js';
import { createPhotosPanel } from './field-photos.js';
import * as offlineQueue from '../lib/offline-queue.js';
import { reviewRequestLink } from '../lib/messaging.js';
import { isNative, hapticLight, getDevicePosition } from '../lib/native.js';

/* The four action types this console queues offline, per the task:
   Passport/checklist writes, adding a measurement, uploading a photo, and
   capturing a signature. Everything else here still calls api.js directly
   and needs a live connection, same as before. */
function queueToast(queued, okMessage) {
  toast(queued ? 'Offline — saved locally, will sync automatically' : okMessage);
}

const JOB_STATUSES = ['new', 'reviewing', 'estimate_drafted', 'site_visit_scheduled', 'assessed',
  'quote_sent', 'accepted', 'declined', 'scheduled', 'in_progress', 'completed', 'invoiced', 'paid',
  'closed', 'lost'];

const CHECKLIST_ITEMS = [
  { key: 'water_spigot_located',        label: 'Water spigot located' },
  { key: 'electrical_outlet_located',   label: 'Electrical outlet located' },
  { key: 'property_access_confirmed',   label: 'Property access confirmed' },
  { key: 'hazards_identified',          label: 'Hazards / flowerbeds identified' }
];

/** Property Passport: persistent, structured intelligence that outlives any
 *  one visit -- pulled up automatically whenever this property's job or
 *  quote is opened, same as the task asks, because it is read straight off
 *  properties.passport every time this view loads rather than cached or
 *  copied onto the job. */
function passportPanel(property, onSaved) {
  const p = property.passport && typeof property.passport === 'object' ? property.passport : {};
  const siding = p.siding || {};
  const roof = p.roof || {};
  const access = p.access || {};

  const fields = {};
  function textField(label, group, key, value, placeholder) {
    const input = el('input', { value: value || '', placeholder: placeholder || '' });
    fields[`${group}.${key}`] = () => input.value.trim();
    return el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: label }), input]);
  }

  const preferencesInput = el('textarea', {
    rows: '2', placeholder: 'e.g. "Avoid east flower beds", "Rear gate code: 1234"'
  });
  preferencesInput.value = p.preferences || '';

  return el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { text: 'Property Passport' }),
        el('p', { text: 'Persists on this property across every future visit and quote.' })
      ])
    ]),
    el('h3', { style: 'margin:0 0 6px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)',
      text: 'Siding' }),
    el('div', { class: 'grid grid--2' }, [
      textField('Material', 'siding', 'material', siding.material, 'Vinyl, wood, brick…'),
      textField('Colour', 'siding', 'color', siding.color)
    ]),
    el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, [
      textField('Elevation heights', 'siding', 'elevations_note', siding.elevations_note,
        'e.g. Front/Left 1-storey, Rear 2-storey'),
      textField('Heavy algae sides', 'siding', 'heavy_algae_sides', siding.heavy_algae_sides, 'e.g. North, Rear')
    ]),

    el('h3', { style: 'margin:16px 0 6px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)',
      text: 'Roof' }),
    el('div', { class: 'grid grid--3' }, [
      textField('Shingle type', 'roof', 'shingle_type', roof.shingle_type),
      textField('Pitch', 'roof', 'pitch', roof.pitch),
      textField('Moss severity', 'roof', 'moss_severity', roof.moss_severity, 'None / light / heavy')
    ]),

    el('h3', { style: 'margin:16px 0 6px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)',
      text: 'Access & utilities' }),
    el('div', { class: 'grid grid--2' }, [
      textField('Water tap location', 'access', 'water_tap_location', access.water_tap_location),
      textField('Electrical receptacle', 'access', 'electrical_receptacle_location', access.electrical_receptacle_location)
    ]),
    el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, [
      textField('Gate width', 'access', 'gate_width', access.gate_width),
      textField('Ladder access restrictions', 'access', 'ladder_access_restrictions', access.ladder_access_restrictions)
    ]),

    el('h3', { style: 'margin:16px 0 6px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)',
      text: 'Customer preferences' }),
    preferencesInput,

    el('div', { class: 'btn-row', style: 'margin-top:14px' }, [
      el('button', {
        class: 'btn btn--primary', text: 'Save passport',
        onClick: async () => {
          // Re-read property.passport rather than the `p` this card was
          // built from: a checklist toggle (which writes straight through,
          // for an instant-feeling tap) can have changed it in place since
          // this card rendered, and spreading the stale snapshot here would
          // silently revert that toggle.
          const latest = property.passport && typeof property.passport === 'object' ? property.passport : {};
          const passport = {
            ...latest,
            siding:  { ...siding, material: fields['siding.material'](), color: fields['siding.color'](),
                       elevations_note: fields['siding.elevations_note'](), heavy_algae_sides: fields['siding.heavy_algae_sides']() },
            roof:    { ...roof, shingle_type: fields['roof.shingle_type'](), pitch: fields['roof.pitch'](),
                       moss_severity: fields['roof.moss_severity']() },
            access:  { ...access, water_tap_location: fields['access.water_tap_location'](),
                       electrical_receptacle_location: fields['access.electrical_receptacle_location'](),
                       gate_width: fields['access.gate_width'](), ladder_access_restrictions: fields['access.ladder_access_restrictions']() },
            preferences: preferencesInput.value.trim()
          };
          try {
            const { queued } = await offlineQueue.callOrQueue(
              'updateProperty', { id: property.id, patch: { passport } }, 'Save Property Passport');
            property.passport = passport;
            queueToast(queued, 'Property Passport saved');
            onSaved?.(passport);
          } catch (err) {
            toast(err.message, 'error');
          }
        }
      })
    ])
  ]);
}

/** On-site checklist: quick, instant-save toggles. Stored inside the same
 *  passport jsonb (passport.checklist.*) rather than a parallel structure --
 *  these ARE the access/utility facts the Passport already models, just
 *  confirmed in one tap during a visit instead of typed out. */
function checklistPanel(property) {
  const p = property.passport && typeof property.passport === 'object' ? property.passport : {};
  const checklist = { ...(p.checklist || {}) };

  const toggles = CHECKLIST_ITEMS.map(item => {
    const on = !!checklist[item.key];
    const box = el('input', { type: 'checkbox', checked: on });
    const label = el('label', { class: `check ${on ? 'is-on' : ''}` }, [box, el('span', { text: item.label })]);
    box.addEventListener('change', async () => {
      hapticLight(); // fire-and-forget -- a missed buzz must never block the save
      checklist[item.key] = box.checked;
      label.className = `check ${box.checked ? 'is-on' : ''}`;
      // Same reasoning as the Passport form's Save handler, in reverse: read
      // property.passport live so an unsaved edit sitting in the Passport
      // form's own fields isn't clobbered by this toggle's write.
      const latest = property.passport && typeof property.passport === 'object' ? property.passport : {};
      try {
        const passport = { ...latest, checklist };
        // No toast here (unlike the Passport form's Save) -- "taps save
        // instantly" means instantly, not an interruption every tap; the
        // topbar's Offline Queue badge is the signal when one goes offline.
        await offlineQueue.callOrQueue('updateProperty', { id: property.id, patch: { passport } }, 'Checklist update');
        property.passport = passport;
      } catch (err) {
        box.checked = !box.checked;
        label.className = `check ${box.checked ? 'is-on' : ''}`;
        toast(err.message, 'error');
      }
    });
    return label;
  });

  return el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [el('h2', { text: 'On-site checklist' }), el('p', { text: 'Taps save instantly.' })])
    ]),
    el('div', { class: 'check-grid' }, toggles)
  ]);
}

/** Mixed-height elevations: a property section carries its own storeys
 *  (and access/ground/ladder/distance) independent of every other section,
 *  which is the whole mechanism "Front 1-storey, Rear 2-storey, Right
 *  1+2-storey mixed" needs -- "mixed" on one elevation is just two sections
 *  both named for that side. Pricing already reads this per-section; this
 *  is a compact mobile editor over the same job_sections table the desktop
 *  tool uses, not a second pricing model. */
function sectionsPanel(job, refs, onChange) {
  const vocab = (groupKey) => {
    const seen = new Map();
    for (const m of refs.modifiers) {
      if (m.group_key !== groupKey) continue;
      if (!seen.has(m.option_key)) seen.set(m.option_key, { value: m.option_key, label: m.label, sort: m.sort_order });
    }
    return [...seen.values()].sort((a, b) => a.sort - b.sort);
  };
  const siteVocab = (groupKey) => refs.siteFactors.filter(f => f.group_key === groupKey)
    .sort((a, b) => a.sort_order - b.sort_order).map(f => ({ value: f.option_key, label: f.label }));

  const heightOpts = vocab('height');
  const accessOpts = vocab('access');

  function row(section) {
    function patch(field) {
      return async (e) => { await api.updateSection(section.id, { [field]: e.target.value }); onChange(); };
    }
    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: section.name, style: 'max-width:200px', 'aria-label': 'Section name',
          onChange: async (e) => { await api.updateSection(section.id, { name: e.target.value.trim() || 'Section' }); onChange(); }
        }),
        el('button', { class: 'btn btn--sm btn--danger', text: 'Remove',
          onClick: async () => {
            if (!confirmAction(`Remove "${section.name}"?`)) return;
            await api.deleteSection(section.id); onChange();
          } })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Storeys' }), select(heightOpts, section.storeys, patch('storeys'))]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Access' }), select(accessOpts, section.access, patch('access'))])
      ]),
      el('div', { class: 'grid grid--3', style: 'margin-top:10px' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Ground' }), select(siteVocab('ground'), section.ground, patch('ground'))]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Ladder' }), select(siteVocab('ladder'), section.ladder, patch('ladder'))]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Distance' }), select(siteVocab('distance'), section.distance, patch('distance'))])
      ])
    ]);
  }

  return el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { text: 'Elevations' }),
        el('p', { text: 'Each elevation keeps its own storeys and access — mix them freely.' })
      ]),
      el('button', {
        class: 'btn btn--sm', text: '+ Elevation',
        onClick: async () => {
          const names = ['Front', 'Rear', 'Left', 'Right', 'Garage', 'Addition'];
          await api.createSection(job.id, {
            name: names[refs.sections.length] || 'Other', sort_order: refs.sections.length + 1
          });
          onChange();
        }
      })
    ]),
    refs.sections.length ? el('div', {}, refs.sections.map(row))
                         : el('div', { class: 'empty', text: 'No elevations yet. Add one above.' })
  ]);
}

export async function renderVisit({ mount, navigate }, jobId) {
  const [job, services, modifiers, siteFactors, flags, flagMap, settings] = await Promise.all([
    api.getJob(jobId), api.listServices(), api.listModifiers(), api.listSiteFactors(),
    api.listInspectionFlags(), api.listServiceFlagMap(), api.getSettings()
  ]);
  const reviewUrl = settings.company?.google_review_url || null;

  const refs = { services, modifiers, siteFactors, flags, flagMap, sections: [] };
  const measurementsPanel = createMeasurementsPanel({
    job, refs, onChange: reload,
    createMeasurementFn: async (jobId, measurement) => {
      const { queued, result } = await offlineQueue.callOrQueue(
        'createMeasurement', { jobId, measurement }, 'Add measurement');
      queueToast(queued, 'Measurement added');
      return queued ? null : result;
    }
  });
  const quotePanel = createQuotePanel({
    job, onChange: reload,
    saveSignatureFn: async (jobId, quoteId, pngBlob, signerName) =>
      offlineQueue.callOrQueue('saveSignature', { jobId, quoteId, pngBlob, signerName }, 'Customer signature')
  });
  const photosPanel = createPhotosPanel({
    jobId: job.id,
    uploadFn: async (jobId, file, opts) => {
      const { queued } = await offlineQueue.callOrQueue('uploadJobPhoto', { jobId, file, opts }, 'Photo upload');
      queueToast(queued, 'Photo added');
      return queued;
    }
  });

  const sectionsHost = el('div', {});
  const passportHost = el('div', {});
  const checklistHost = el('div', {});

  const statusSelect = select(
    JOB_STATUSES.map(s => ({ value: s, label: humanise(s) })), job.status,
    async (e) => { await api.updateJob(job.id, { status: e.target.value }); toast('Status updated'); }
  );

  // Every offline-queued save below (passport, a measurement, a signature)
  // calls this afterward via onChange/onSaved WITHOUT awaiting it -- so
  // until this fix, a live refresh failing offline became an invisible
  // unhandled promise rejection: the save itself queued correctly, but
  // reload() silently never got to repaint anything. These hold the last
  // successful fetch so an offline repaint has real data to show instead
  // of nothing; measurementsPanel/quotePanel take their data as render()
  // params rather than reading job/refs directly, so they need an explicit
  // cache -- sectionsPanel/passportPanel/checklistPanel don't, since they
  // read job/refs, which the caller already mutated locally before this runs.
  let lastMeasurements = [];
  let lastPricing = null;
  let lastQuotes = [];

  async function reload() {
    let sections = refs.sections, measurements = lastMeasurements, pricing = lastPricing, quotes = lastQuotes;
    try {
      const [fresh, freshSections, freshMeasurements, jobFlags, freshPricing, freshQuotes] = await Promise.all([
        api.getJob(job.id), api.listSections(job.id), api.listMeasurements(job.id),
        api.listJobFlags(job.id), api.calculatePricing(job.id), api.listQuotes(job.id)
      ]);
      job.status = fresh.status;
      job.properties = fresh.properties;
      if (statusSelect.value !== fresh.status) statusSelect.value = fresh.status;
      sections = freshSections; measurements = freshMeasurements; pricing = freshPricing; quotes = freshQuotes;
      refs.sections = sections;
      lastMeasurements = measurements; lastPricing = pricing; lastQuotes = quotes;
    } catch (err) {
      // A queued offline save already landed locally -- job/refs were
      // mutated by the caller before reload() ran, so there is nothing
      // fresher to fetch until this actually syncs. Repaint with what's
      // already in memory rather than letting this bubble up: a real error
      // (bad input, RLS denial) still isn't swallowed, only a looks-offline
      // failure takes this path.
      if (!offlineQueue.looksOffline(err)) throw err;
    }

    clear(sectionsHost).append(sectionsPanel(job, refs, reload));
    clear(passportHost).append(passportPanel(job.properties, reload));
    clear(checklistHost).append(checklistPanel(job.properties));
    measurementsPanel.render({ measurements, pricing });
    quotePanel.render({ quotes });
    try {
      // photosPanel.render() does its own live fetch (listAttachments) --
      // field-photos.js already skips calling it after ITS OWN queued
      // upload, but reload() can also be triggered by a different panel's
      // offline save (e.g. the passport), so the same guard is needed here.
      await photosPanel.render();
    } catch (err) {
      if (!offlineQueue.looksOffline(err)) throw err;
    }
  }

  const phone = job.customers?.phone;
  const address = [job.properties?.address_line1, job.properties?.city, job.properties?.postal_code]
    .filter(Boolean).join(', ');

  // Today's Schedule geofence banner needs properties.latitude/longitude to
  // compare against -- almost never set today (nothing has ever written
  // it), so without this the feature stays permanently inert. One tap,
  // standing at the property right now, fixes that going forward; no
  // separate "edit coordinates" form, since a GPS fix taken on-site is more
  // trustworthy than anything a form could ask someone to type in.
  const hasPin = job.properties?.latitude != null && job.properties?.longitude != null;
  const pinBtn = el('button', {
    class: 'btn btn--sm', type: 'button', text: hasPin ? '📍 Update Location Pin' : '📍 Save Location Pin',
    onClick: async () => {
      let nextText = pinBtn.textContent;
      pinBtn.disabled = true;
      pinBtn.textContent = 'Locating…';
      try {
        const pos = await getDevicePosition();
        if (!pos) { toast('Could not get the device location', 'error'); return; }
        const { queued } = await offlineQueue.callOrQueue('updateProperty',
          { id: job.properties.id, patch: { latitude: pos.latitude, longitude: pos.longitude } },
          'Save property location');
        job.properties.latitude = pos.latitude;
        job.properties.longitude = pos.longitude;
        nextText = '📍 Update Location Pin';
        queueToast(queued, 'Location pin saved — today’s schedule can now detect arrival here');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        pinBtn.disabled = false;
        pinBtn.textContent = nextText;
      }
    }
  });

  clear(mount).append(
    el('div', { class: 'page-head', style: 'padding:0 0 10px' }, [
      el('a', { href: '#/', text: '← Today’s schedule', class: 'hint' }),
      el('h1', { text: job.customers?.name || 'Visit' }),
      el('p', { text: address || 'No address on file' })
    ]),
    el('div', { class: 'card' }, [
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Status' }), statusSelect]),
        el('div', {})
      ]),
      el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
        address ? el('a', { class: 'btn', target: '_blank', rel: 'noopener',
          href: `https://maps.google.com/?q=${encodeURIComponent(address)}`, text: 'Navigate' }) : null,
        pinBtn,
        phone ? el('a', { class: 'btn', href: `tel:${phone}`, text: 'Call' }) : null,
        phone ? el('a', { class: 'btn', href: `sms:${phone}`, text: 'Text' }) : null,
        phone ? el('a', {
          class: 'btn btn--sm', href: reviewRequestLink(phone, job.customers?.name, reviewUrl),
          text: 'Request Review'
        }) : null,
        el('a', {
          class: 'btn btn--sm',
          // target=_blank's new-tab behaviour has nothing to land in inside
          // a native WebView (no tab strip) -- native navigates the same
          // window instead; the page itself has its own native-aware Share
          // Report button once it loads (completion-report.js).
          ...(isNative() ? {} : { target: '_blank', rel: 'noopener' }),
          href: `completion-report.html?job_id=${job.id}`, text: 'Generate Completion Report'
        })
      ]),
      !reviewUrl ? el('p', { class: 'hint', style: 'margin-top:6px',
        text: 'No Google review link on file yet — add one under app_settings.company.google_review_url ' +
              'to include it automatically.' }) : null
    ]),
    passportHost,
    checklistHost,
    sectionsHost,
    measurementsPanel.root,
    el('div', { class: 'card' }, [quotePanel.root]),
    photosPanel.root
  );

  await reload();
}
