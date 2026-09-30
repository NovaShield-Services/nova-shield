import { supabase } from '../../../shared/supabase.js';
import { el, clear, field } from '../../../shared/dom.js';

export function renderLogin({ mount, onSignedIn }) {
  const errorEl = el('p', { class: 'error-text', hidden: true });
  const emailInput = el('input', { type: 'email', autocomplete: 'username', required: true });
  const passInput = el('input', { type: 'password', autocomplete: 'current-password', required: true });
  const submit = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Sign in',
                                style: 'width:100%' });

  async function handleSubmit(e) {
    e.preventDefault();
    errorEl.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Signing in…';

    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passInput.value
    });

    submit.disabled = false;
    submit.textContent = 'Sign in';

    if (error) {
      // deliberately vague: don't confirm whether an address has an account
      errorEl.textContent = 'That email and password combination was not recognised.';
      errorEl.hidden = false;
      passInput.value = '';
      passInput.focus();
      return;
    }
    onSignedIn();
  }

  clear(mount).append(
    el('div', { class: 'login' }, [
      el('div', { class: 'card' }, [
        el('h1', { text: 'Nova Shield' }),
        el('p', { class: 'sub', text: 'Internal field tool — staff access only' }),
        el('form', { onSubmit: handleSubmit }, [
          field('Email', emailInput),
          field('Password', passInput),
          submit,
          errorEl
        ])
      ]),
      el('p', { class: 'hint', style: 'text-align:center',
                text: 'Customer information is only visible to authorised staff accounts.' })
    ])
  );

  emailInput.focus();
}
