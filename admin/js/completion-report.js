import { getSession, supabase } from '../../shared/supabase.js';
import { el, clear, toast } from '../../shared/dom.js';
import { date, humanise } from '../../shared/format.js';
import { renderLogin } from './views/login.js';
import * as api from './lib/api.js';
import { isNative, shareCurrentPage } from './lib/native.js';

/* Staff-facing, not a public link like quote.html -- job_attachments and
   job_notes carry internal content that was never meant to be anonymously
   readable. To hand this to a customer, print it (same "download PDF, send
   it manually" pattern already used for quotes) rather than texting a live
   URL to this page. */

const doc = document.getElementById('doc');

function message(title, body) {
  clear(doc).append(el('div', { class: 'sheet' }, [
    el('h1', { style: 'margin-top:0', text: title }),
    el('p', { style: 'color:#6c7772', text: body })
  ]));
}

function printWhenReady() {
  const go = () => requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(go).catch(go);
  else go();
}

async function photoFigure(attachment, label) {
  const img = el('img', { alt: attachment.caption || label });
  try {
    img.src = await api.signedPhotoUrl(attachment.storage_path, 900, 'job-photos');
  } catch (err) { /* leave broken -- better than blocking the whole report */ }
  return el('figure', {}, [img, el('figcaption', { text: attachment.caption ? `${label} — ${attachment.caption}` : label })]);
}

async function render(job, services, measurements, attachments, notes) {
  const company = {}; // filled in below once settings resolve
  const settings = await api.getSettings().catch(() => ({}));
  Object.assign(company, settings.company || {});

  const address = [job.properties?.address_line1, job.properties?.city, job.properties?.postal_code]
    .filter(Boolean).join(', ');

  const serviceNames = [...new Set(measurements.map(m => services.find(s => s.id === m.service_id)?.name).filter(Boolean))];

  const before = attachments.filter(a => a.kind === 'before');
  const after = attachments.filter(a => a.kind === 'after');
  const pairCount = Math.max(before.length, after.length);
  const pairs = [];
  for (let i = 0; i < pairCount; i++) {
    const row = el('div', { class: 'photo-pair' });
    pairs.push(row);
    (async () => {
      row.append(
        before[i] ? await photoFigure(before[i], 'Before') : el('figure', {}),
        after[i] ? await photoFigure(after[i], 'After') : el('figure', {})
      );
    })();
  }

  // Native has no OS print sheet to hand this document to -- share it
  // instead, as a snapshot of the page exactly as rendered right now (real
  // data, since this button only exists once render() has already run).
  const printBtn = el('button', {
    class: 'btn no-print', text: isNative() ? 'Share Report' : 'Print / Save as PDF',
    onClick: async () => {
      if (!isNative()) return window.print();
      const ok = await shareCurrentPage({ fileName: `completion-report-${job.id}.html`, title: 'Nova Shield Completion Report' });
      if (!ok) { toast('Could not open the share sheet — printing instead', 'error'); window.print(); }
    }
  });

  clear(doc).append(
    el('div', { class: 'sheet' }, [
      el('div', { class: 'rep-head' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:800;font-size:1.1rem', text: company.display_name || 'Nova Shield' }),
          el('p', { style: 'margin:6px 0 0;font-size:.84rem;color:#6c7772' }, [
            company.phone || '', el('br'), company.email || ''
          ])
        ]),
        el('div', { class: 'meta' }, [
          el('strong', { text: 'Completion Report' }),
          el('div', { text: job.reference || '' }),
          // ns_jobs.completed_at, not the print date. This used to be
          // date(new Date()), so a report regenerated a week later claimed
          // the wrong completion date -- and before completion was a real
          // action, completed_at was always NULL so there was nothing else
          // to use. An un-completed job says so rather than dating itself
          // today and implying work that hasn't been recorded as finished.
          el('div', { text: job.completed_at ? date(job.completed_at) : 'Not yet marked complete' })
        ])
      ]),

      el('div', { class: 'rep-section' }, [
        el('h2', { text: 'Property' }),
        el('p', { style: 'margin:0;font-weight:600', text: job.customers?.name || '' }),
        el('p', { style: 'margin:2px 0 0;color:#5f6a65', text: address || 'No address on file' })
      ]),

      el('div', { class: 'rep-section' }, [
        el('h2', { text: 'Completed services' }),
        serviceNames.length
          ? el('div', {}, serviceNames.map(name => el('div', { class: 'service-check', text: name })))
          : el('p', { style: 'margin:0;color:#8a948f', text: 'No services recorded on this job.' })
      ]),

      el('div', { class: 'rep-section' }, [
        el('h2', { text: 'Before & after' }),
        pairs.length
          ? el('div', { class: 'photo-pairs' }, pairs)
          : el('p', { style: 'margin:0;color:#8a948f', text: 'No before/after photos tagged on this job yet.' })
      ]),

      notes.length ? el('div', { class: 'rep-section' }, [
        el('h2', { text: 'Notes for the customer' }),
        ...notes.map(n => el('p', { style: 'margin:0 0 8px', text: n.body }))
      ]) : null,

      el('div', { class: 'rep-section' }, [
        el('h2', { text: 'Technician sign-off' }),
        el('div', { class: 'signoff-line' }, [
          el('label', { class: 'field' }, [el('span', { text: 'Technician name' }), el('input', {})]),
          el('label', { class: 'field' }, [
            el('span', { text: 'Date' }),
            el('input', { value: job.completed_at ? date(job.completed_at) : date(new Date()) })
          ])
        ])
      ]),

      el('div', { class: 'btn-row no-print', style: 'margin-top:28px' }, [printBtn])
    ])
  );
}

async function load() {
  const { session, isAdmin } = await getSession();
  if (!session) return renderLogin({ mount: doc, onSignedIn: load });
  if (!isAdmin) return message('Not authorised', 'This account does not have field tool access.');

  const jobId = new URLSearchParams(window.location.search).get('job_id');
  const autoprint = new URLSearchParams(window.location.search).get('print') === '1';
  if (!jobId) return message('No job specified', 'This link is missing its job_id.');

  let job, services, measurements, attachments, notes;
  try {
    [job, services, measurements, attachments, notes] = await Promise.all([
      api.getJob(jobId), api.listServices(), api.listMeasurements(jobId),
      api.listAttachments(jobId), api.listNotes(jobId)
    ]);
  } catch (err) {
    return message('Could not load this job', err.message);
  }
  // Customer-facing notes only -- internal notes stay internal, same
  // distinction job_notes.visibility already enforces elsewhere.
  notes = notes.filter(n => n.visibility === 'customer');

  await render(job, services, measurements, attachments, notes);
  if (autoprint) printWhenReady();
}

load();
