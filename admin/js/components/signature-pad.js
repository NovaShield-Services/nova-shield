import { el, toast, confirmAction } from '../../../shared/dom.js';
import { hapticLight } from '../lib/native.js';

/** A touch-friendly signature canvas plus the "Signer full name" + "Approve
 *  & Save Signature" workflow around it. Used from both the admin quote
 *  view (quote.js) and the field workspace -- one component, so a customer
 *  signing on a tablet in the field and a signature taken at a desk produce
 *  identical data.
 *
 *  onSave(pngBlob, signerName) does the actual upload + RPC call; this
 *  component only owns drawing and the two inputs.
 *
 *  unapprovedServices (service names with pricing_approved=false on this
 *  quote) makes the confirm an explicit override, not a silent accept --
 *  the RPC itself still allows it (an authenticated admin's call), same
 *  as the send-confirmation's warning clause for the same condition. */
export function createSignaturePad({ onSave, unapprovedServices = [] }) {
  const canvas = el('canvas', {
    style: 'width:100%;height:220px;touch-action:none;display:block;' +
           'border:1px solid var(--line);border-radius:10px;background:#fff;cursor:crosshair'
  });
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasStrokes = false;
  let last = null;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const prev = hasStrokes ? canvas.toDataURL() : null;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#16211f';
    if (prev) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = prev;
    }
  }

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];
    return {
      x: (touch ? touch.clientX : e.clientX) - rect.left,
      y: (touch ? touch.clientY : e.clientY) - rect.top
    };
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    hasStrokes = true;
    last = pointFromEvent(e);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }
  function end() { drawing = false; }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  // touch fallback for older WebViews without full Pointer Events support
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  const nameInput = el('input', { placeholder: 'Full name', 'aria-label': 'Signer full name' });

  const clearBtn = el('button', {
    class: 'btn btn--sm', text: 'Clear', type: 'button',
    onClick: () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasStrokes = false;
    }
  });

  const saveBtn = el('button', {
    class: 'btn btn--primary', text: 'Approve & Save Signature', type: 'button',
    onClick: async () => {
      if (!hasStrokes) return toast('Draw a signature first', 'error');
      const name = nameInput.value.trim();
      if (!name) return toast('Enter the signer’s full name', 'error');
      const warning = unapprovedServices.length
        ? `\n\nHeads up: ${unapprovedServices.join(', ')} ${unapprovedServices.length === 1 ? 'is' : 'are'} priced ` +
          'from a rate the owner hasn’t commercially approved yet. Recording this signature tells the customer this is a real, final number.'
        : '';
      if (!confirmAction(`Record ${name}'s signature and mark this quote accepted?${warning}`)) return;

      saveBtn.disabled = true;
      const prevText = saveBtn.textContent;
      saveBtn.textContent = 'Saving…';
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Could not capture the signature image.');
        await onSave(blob, name);
        hapticLight();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = prevText;
      }
    }
  });

  const root = el('div', {}, [
    canvas,
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [clearBtn]),
    el('label', { class: 'field', style: 'margin-top:10px' }, [
      el('span', { text: 'Signer full name' }), nameInput
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:10px' }, [saveBtn]),
    el('p', { class: 'hint', style: 'margin-top:6px',
      text: 'Saving locks this quote as accepted, the same as the customer accepting it online.' })
  ]);

  // The canvas needs real pixel dimensions, which only exist once it's laid
  // out -- deferred a tick past insertion rather than sized at creation time.
  requestAnimationFrame(resizeCanvas);
  window.addEventListener('resize', resizeCanvas);

  return { root };
}
