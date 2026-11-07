import { api, element, message, reviewCard } from './shared.js';

const notice = document.getElementById('admin-message');
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = loginForm.querySelector('button');
    if (button.disabled) return;
    button.disabled = true; button.textContent = 'Logging in…';
    message(notice, '');
    try {
      await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: loginForm.elements.password.value }) });
      loginForm.reset();
      window.location.replace('/admin');
    } catch (error) { message(notice, error.message, 'error'); loginForm.elements.password.value = ''; }
    finally { button.disabled = false; button.textContent = 'Log in'; }
  });
} else {
  let csrf = '';
  let status = 'pending';
  let page = 1;
  let busy = false;
  let hasMore = false;
  const list = document.getElementById('admin-reviews');
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const refresh = document.getElementById('refresh');
  const logout = document.getElementById('logout');
  const filters = [...document.querySelectorAll('[data-status]')];
  const names = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

  function controls(disabled) {
    busy = disabled;
    filters.forEach(button => { button.disabled = disabled; });
    refresh.disabled = disabled; logout.disabled = disabled;
    previous.disabled = disabled || page === 1; next.disabled = disabled || !hasMore;
    list.querySelectorAll('button').forEach(button => { button.disabled = disabled; });
    list.setAttribute('aria-busy', String(disabled));
  }

  function fail(error) {
    if (error.status === 401) {
      list.replaceChildren();
      window.location.replace('/admin');
    } else message(notice, error.message, 'error');
  }

  async function render() {
    const data = await api(`/api/admin/reviews?status=${status}&page=${page}`);
    if (!data.reviews.length && page > 1) { page--; return render(); }
    list.replaceChildren();
    const stats = document.getElementById('admin-stats');
    stats.replaceChildren();
    for (const key of ['pending', 'approved', 'rejected', 'total']) {
      const item = element('div');
      item.append(element('dt', key === 'total' ? 'Total reviews' : `${names[key]} reviews`), element('dd', String(data.stats[key])));
      stats.append(item);
    }
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.status === status)));
    document.getElementById('section-heading').textContent = `${names[status]} reviews`;
    if (!data.reviews.length) list.append(element('p', `No ${status} reviews.`, 'message'));
    for (const review of data.reviews) {
      const card = reviewCard(review);
      const actions = element('div', undefined, 'actions');
      for (const target of ['approved', 'rejected', 'pending'].filter(value => value !== status)) {
        const label = target === 'approved' ? 'Approve review' : target === 'rejected' ? 'Reject review' : 'Move to pending';
        const button = element('button', label, `btn${target === 'approved' ? ' btn-filled' : ''}`);
        button.type = 'button';
        button.setAttribute('aria-label', `${label} by ${review.client_name}`);
        button.addEventListener('click', async () => {
          if (busy) return;
          controls(true);
          try {
            const result = await api(`/api/admin/reviews/${review.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ status: target, expected_status: review.status }) });
            await render();
            message(notice, result.message, 'success');
            // The acted-on card disappears; move focus to the section heading.
            const heading = document.getElementById('section-heading'); heading.tabIndex = -1; heading.focus();
          } catch (error) { fail(error); }
          finally { controls(false); }
        });
        actions.append(button);
      }
      card.append(actions); list.append(card);
    }
    hasMore = data.has_more;
    document.getElementById('page-label').textContent = `Page ${page}`;
  }

  async function load() {
    if (busy) return;
    controls(true);
    try { if (!csrf) csrf = (await api('/api/admin/session')).csrf_token; await render(); }
    catch (error) { fail(error); }
    finally { controls(false); }
  }
  filters.forEach(button => button.addEventListener('click', () => { if (!busy) { status = button.dataset.status; page = 1; load(); } }));
  previous.addEventListener('click', () => { if (!busy && page > 1) { page--; load(); } });
  next.addEventListener('click', () => { if (!busy && hasMore) { page++; load(); } });
  refresh.addEventListener('click', load);
  logout.addEventListener('click', async () => {
    if (busy) return;
    controls(true);
    try {
      await api('/api/admin/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } });
      window.location.replace('/admin');
    } catch (error) { fail(error); controls(false); }
  });
  // Fresh submissions appear without reloading; suppress background refresh while hidden/busy.
  setInterval(() => { if (!document.hidden && !busy) load(); }, 60000);
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  load();
}
