import * as api from '../lib/api.js';
import { el, clear, toast, select, confirmAction } from '../../../shared/dom.js';
import { money, date, humanise } from '../../../shared/format.js';
import { createMeasurementsPanel } from './measurements.js';
import { createQuotePanel } from './quote.js';
import { reviewFlag } from '../components/review-flag.js';

const JOB_STATUSES = ['new','reviewing','estimate_drafted','site_visit_scheduled','assessed',
  'quote_sent','accepted','declined','scheduled','in_progress','completed','invoiced','paid',
  'closed','lost'];

/* ------------------------------------------------------------- job list -- */

export async function renderJobs({ mount }) {
  const jobs = await api.listJobs('all');

  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Jobs' }),
      el('p', { text: `${jobs.length} job${jobs.length === 1 ? '' : 's'}` })
    ]),
    jobs.length
      ? el('div', {}, jobs.map(j => el('div', { class: 'row-item' }, [
          el('div', { class: 'row-item__main' }, [
            el('strong', { text: j.customers?.name || 'Unnamed' }),
            el('span', { class: 'row-item__meta',
              text: [j.reference, j.properties?.address_line1].filter(Boolean).join(' · ') })
          ]),
          el('span', { class: 'badge badge--muted', text: humanise(j.status) }),
          el('a', { class: 'btn btn--sm', href: `#/jobs/${j.id}`, text: 'Open' })
        ])))
      : el('div', { class: 'empty', text: 'No jobs yet. Convert a request to get started.' })
  );
}

/* ----------------------------------------------------------- job detail -- */

export async function renderJob({ mount }, jobId) {
  const [job, services, modifiers, siteFactors, flags, flagMap, pricingRules] = await Promise.all([
    api.getJob(jobId),
    api.listServices(),
    api.listModifiers(),
    api.listSiteFactors(),
    api.listInspectionFlags(),
    api.listServiceFlagMap(),
    api.listPricingRules()
  ]);

  const refs = { services, modifiers, siteFactors, flags, flagMap, pricingRules, sections: [] };

  /* The section vocabulary is shared across services, so derive it from the
     price book rather than hardcoding it in the UI. */
  function vocabulary(groupKey) {
    const seen = new Map();
    for (const m of modifiers) {
      if (m.group_key !== groupKey) continue;
      if (!seen.has(m.option_key)) seen.set(m.option_key, { value: m.option_key, label: m.label, sort: m.sort_order });
    }
    return [...seen.values()].sort((a, b) => a.sort - b.sort);
  }

  function siteVocabulary(groupKey) {
    return refs.siteFactors
      .filter(f => f.group_key === groupKey)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(f => ({ value: f.option_key, label: f.label }));
  }

  const HEIGHT_OPTS = vocabulary('height');
  const ACCESS_OPTS = vocabulary('access');

  const sectionsHost = el('div', {});
  const photosHost = el('div', {});
  const inspectionHost = el('div', {});
  const pricingHost = el('div', {});
  const measurementsPanel = createMeasurementsPanel({ job, refs, onChange: reload });
  const quotePanel = createQuotePanel({ job, onChange: reload });

  /* ------------------------------------------------------------ sections -- */

  function sectionReviewToggle(section) {
    return reviewFlag({
      required: section.review_required, reason: section.review_reason,
      label: 'Flag this elevation for review',
      save: (patch) => api.updateSection(section.id, patch)
    });
  }

  function renderSections() {
    const rows = refs.sections.map(section => {
      function patch(field) {
        return async e => {
          await api.updateSection(section.id, { [field]: e.target.value });
          section[field] = e.target.value;
          refreshPricing();
        };
      }

      return el('div', { class: 'section-box' }, [
        el('div', { class: 'section-box__head' }, [
          el('input', {
            value: section.name, 'aria-label': 'Section name', style: 'max-width:240px',
            onChange: async e => {
              const name = e.target.value.trim() || 'Section';
              await api.updateSection(section.id, { name });
              section.name = name;
            }
          }),
          el('button', {
            class: 'btn btn--sm btn--danger', text: 'Remove',
            onClick: async () => {
              if (!confirmAction(`Remove "${section.name}"? Measurements using it will lose their section.`)) return;
              await api.deleteSection(section.id);
              await reload();
            }
          })
        ]),
        el('div', { class: 'grid grid--2' }, [
          el('label', { class: 'field', style: 'margin:0' }, [
            el('span', { text: 'Height' }), select(HEIGHT_OPTS, section.storeys, patch('storeys'))
          ]),
          el('label', { class: 'field', style: 'margin:0' }, [
            el('span', { text: 'Access' }), select(ACCESS_OPTS, section.access, patch('access'))
          ])
        ]),
        el('div', { class: 'grid grid--3', style: 'margin-top:10px' }, [
          el('label', { class: 'field', style: 'margin:0' }, [
            el('span', { text: 'Ground' }), select(siteVocabulary('ground'), section.ground, patch('ground'))
          ]),
          el('label', { class: 'field', style: 'margin:0' }, [
            el('span', { text: 'Ladder' }), select(siteVocabulary('ladder'), section.ladder, patch('ladder'))
          ]),
          el('label', { class: 'field', style: 'margin:0' }, [
            el('span', { text: 'Distance' }), select(siteVocabulary('distance'), section.distance, patch('distance'))
          ])
        ]),
        sectionReviewToggle(section)
      ]);
    });

    clear(sectionsHost).append(
      el('div', { class: 'card' }, [
        el('div', { class: 'card__head' }, [
          el('div', {}, [
            el('h2', { text: 'Property layout' }),
            el('p', { text: 'The front can be one storey while the rear is two. These values drive the price.' })
          ]),
          el('button', {
            class: 'btn btn--sm', text: '+ Add section',
            onClick: async () => {
              const names = ['Front','Rear','Left side','Right side','Garage','Addition'];
              await api.createSection(job.id, {
                name: names[refs.sections.length] || 'Other',
                sort_order: refs.sections.length + 1
              });
              await reload();
            }
          })
        ]),
        rows.length ? el('div', {}, rows)
                    : el('div', { class: 'empty', text: 'No sections yet.' })
      ])
    );
  }

  /* -------------------------------------------------------------- photos -- */

  async function renderPhotos(attachments) {
    if (!attachments.length) {
      clear(photosHost).append(
        el('div', { class: 'card' }, [
          el('div', { class: 'card__head' }, [
            el('div', {}, [
              el('h2', { text: 'Photos' }),
              el('p', { text: 'Nothing attached. Customer uploads from the website appear here.' })
            ])
          ])
        ])
      );
      return;
    }

    const grid = el('div', {
      style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px'
    });

    clear(photosHost).append(
      el('div', { class: 'card' }, [
        el('div', { class: 'card__head' }, [
          el('div', {}, [
            el('h2', { text: 'Photos' }),
            el('p', { text: `${attachments.length} attached · links expire after 15 minutes` })
          ])
        ]),
        grid
      ])
    );

    for (const a of attachments) {
      const tile = el('div', {
        style: 'border:1px solid var(--line);border-radius:10px;overflow:hidden;' +
               'aspect-ratio:1;background:var(--surface-2);display:grid;place-items:center'
      });
      grid.append(tile);
      try {
        const url = await api.signedPhotoUrl(a.storage_path);
        clear(tile).append(el('a', { href: url, target: '_blank', rel: 'noopener',
          style: 'display:block;width:100%;height:100%' }, [
          el('img', { src: url, alt: a.caption || 'Customer photo',
                      style: 'width:100%;height:100%;object-fit:cover;display:block' })
        ]));
      } catch (err) {
        clear(tile).append(el('span', { class: 'hint', style: 'padding:8px;text-align:center',
                                        text: 'Preview unavailable' }));
      }
    }
  }

  /* ---------------------------------------------------------- inspection -- */

  function renderInspection(measurements, activeFlagIds) {
    const serviceIds = new Set(measurements.map(m => m.service_id));
    const relevant = new Set(
      flagMap.filter(r => serviceIds.has(r.service_id)).map(r => r.flag_id)
    );
    const shown = flags.filter(f => relevant.has(f.id));

    const checks = shown.map(flag => {
      const on = activeFlagIds.has(flag.id);
      const box = el('input', { type: 'checkbox', checked: on });
      const label = el('label', { class: `check ${on ? 'is-on' : ''}` }, [
        box, el('span', { text: flag.name })
      ]);
      box.addEventListener('change', async () => {
        await api.setJobFlag(job.id, flag.id, box.checked);
        await reload();
      });
      return label;
    });

    const warnings = flags
      .filter(f => activeFlagIds.has(f.id) && relevant.has(f.id))
      .map(f => el('div', { class: 'warn' }, [
        el('strong', { text: f.name }), el('span', { text: f.warning })
      ]));

    clear(inspectionHost).append(
      el('div', { class: 'card' }, [
        el('div', { class: 'card__head' }, [
          el('div', {}, [
            el('h2', { text: 'Site inspection' }),
            el('p', { text: shown.length
              ? 'Only showing checks relevant to the services on this job.'
              : 'Add a service to see the relevant checks.' })
          ]),
          activeFlagIds.size
            ? el('span', { class: 'badge badge--warn', text: `${activeFlagIds.size} flagged` })
            : null
        ]),
        shown.length ? el('div', { class: 'check-grid' }, checks) : null,
        ...warnings
      ])
    );
  }

  /* ------------------------------------------------------------- pricing -- */

  function renderPricing(pricing) {
    const subtotal = pricing.reduce((sum, p) => sum + Number(p.amount), 0);

    clear(pricingHost).append(
      el('div', { class: 'card' }, [
        el('div', { class: 'card__head' }, [
          el('div', {}, [
            el('h2', { text: 'Calculated price' }),
            el('p', { text: 'What the price book says. You still decide the final number.' })
          ])
        ]),
        ...pricing.map(p => el('div', { class: 'qline' }, [
          el('span', {}, [
            p.service_name,
            el('span', { class: 'qline__sub',
              text: p.minimum_applied ? 'minimum charge applied' : '' })
          ]),
          el('span', { class: 'money', text: money(p.amount) })
        ])),
        el('div', { class: 'qline qline--total' }, [
          el('span', { text: 'Calculated subtotal' }),
          el('span', { class: 'money total-hero', text: money(subtotal) })
        ])
      ])
    );
  }

  async function refreshPricing() {
    const pricing = await api.calculatePricing(job.id);
    renderPricing(pricing);
    return pricing;
  }

  /* -------------------------------------------------------------- reload -- */

  async function reload() {
    const [fresh, sections, measurements, jobFlags, pricing, quotes, attachments] = await Promise.all([
      api.getJob(job.id),
      api.listSections(job.id),
      api.listMeasurements(job.id),
      api.listJobFlags(job.id),
      api.calculatePricing(job.id),
      api.listQuotes(job.id),
      api.listAttachments(job.id)
    ]);

    // sending a quote advances the job server-side, so re-sync the header
    // rather than leaving a stale status in the dropdown
    job.status = fresh.status;
    if (statusSelect.value !== fresh.status) statusSelect.value = fresh.status;

    refs.sections = sections;
    renderSections();
    measurementsPanel.render({ measurements, pricing });
    renderInspection(measurements, new Set(jobFlags.map(f => f.flag_id)));
    renderPricing(pricing);
    quotePanel.render({ quotes, measurements, services });
    renderPhotos(attachments);   // async, fills in as signed URLs resolve
  }

  /* --------------------------------------------------------------- shell -- */

  const statusSelect = select(
    JOB_STATUSES.map(s => ({ value: s, label: humanise(s) })),
    job.status,
    async e => {
      await api.updateJob(job.id, { status: e.target.value });
      toast('Status updated');
    }
  );

  const address = [job.properties?.address_line1, job.properties?.city, job.properties?.postal_code]
    .filter(Boolean).join(', ');

  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('a', { href: '#/jobs', text: '← All jobs', class: 'hint' }),
      el('h1', { text: job.customers?.name || 'Job' }),
      el('p', { text: [job.reference, address].filter(Boolean).join(' · ') })
    ]),
    el('div', { class: 'card' }, [
      el('div', { class: 'grid grid--3' }, [
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Status' }), statusSelect
        ]),
        el('div', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Phone' }),
          el('p', {}, [el('a', { href: `tel:${job.customers?.phone || ''}`,
                                 text: job.customers?.phone || '—' })])
        ]),
        el('div', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Email' }),
          el('p', {}, [el('a', { href: `mailto:${job.customers?.email || ''}`,
                                 text: job.customers?.email || '—' })])
        ])
      ])
    ]),
    sectionsHost,
    photosHost,
    measurementsPanel.root,
    inspectionHost,
    pricingHost,
    el('div', { class: 'card' }, [quotePanel.root])
  );

  await reload();
}
