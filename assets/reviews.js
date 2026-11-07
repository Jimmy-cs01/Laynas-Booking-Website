import { api, element, message, reviewCard } from './shared.js';

const menu = document.getElementById('hamburger');
const navigation = document.querySelector('nav ul');
const mobileNavigation = window.matchMedia('(max-width: 1100px)');
function closeMenu() {
  menu.classList.remove('open'); navigation.classList.remove('open'); menu.setAttribute('aria-expanded', 'false');
  navigation.inert = mobileNavigation.matches;
}
menu.addEventListener('click', () => {
  const open = menu.classList.toggle('open'); navigation.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open));
  navigation.inert = mobileNavigation.matches && !open;
});
navigation.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
mobileNavigation.addEventListener('change', closeMenu);
closeMenu();

const list = document.getElementById('review-list');
const notice = document.getElementById('reviews-message');
const more = document.getElementById('load-more');
const retry = document.getElementById('retry-reviews');
let page = 0;
let loading = false;
const seen = new Set();

function showStats(stats) {
  const section = document.getElementById('review-stats');
  section.replaceChildren();
  section.hidden = stats.total === 0;
  if (!stats.total) return;
  section.append(element('p', `${stats.average.toFixed(1)} / 5`, 'average'), element('p', `Based on ${stats.total} approved ${stats.total === 1 ? 'review' : 'reviews'}`));
  const distribution = element('div', undefined, 'distribution');
  for (let rating = 5; rating >= 1; rating--) {
    const count = stats.distribution[rating - 1];
    const row = element('div', undefined, 'distribution-row');
    const progress = element('progress');
    progress.max = stats.total; progress.value = count;
    progress.setAttribute('aria-label', `${rating} stars: ${count} reviews`);
    row.append(element('span', `${rating} ★`), progress, element('span', String(count)));
    distribution.append(row);
  }
  section.append(distribution);
}

async function loadReviews() {
  if (loading) return;
  loading = true; more.disabled = true; retry.hidden = true;
  try {
    const data = await api(`/api/reviews?page=${page + 1}`);
    for (const review of data.reviews) {
      if (!seen.has(review.id)) { list.append(reviewCard(review)); seen.add(review.id); }
    }
    page = data.page;
    showStats(data.stats);
    message(notice, data.stats.total ? '' : 'Your words could be the first. Approved client reviews will appear here.');
    more.hidden = !data.has_more;
  } catch (error) { message(notice, error.message, 'error'); retry.hidden = false; }
  finally { loading = false; more.disabled = false; }
}
more.addEventListener('click', loadReviews);
retry.addEventListener('click', loadReviews);
loadReviews();

const form = document.getElementById('review-form');
const formNotice = document.getElementById('form-message');
const button = form.querySelector('button[type="submit"]');
let submitting = false;
let submissionKey = crypto.randomUUID();
let previousPayload = '';
const radios = [...form.querySelectorAll('input[name="rating"]')];
radios.forEach(radio => radio.addEventListener('change', () => {
  const rating = Number(form.elements.rating.value);
  radios.forEach(input => input.parentElement.classList.toggle('selected', Number(input.value) <= rating));
  document.getElementById('rating-label').textContent = `${rating} out of 5 stars selected`;
}));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || !form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  values.rating = Number(values.rating);
  const payload = JSON.stringify(values);
  if (previousPayload && previousPayload !== payload) submissionKey = crypto.randomUUID();
  previousPayload = payload;
  submitting = true; button.disabled = true; button.textContent = 'Submitting…'; form.setAttribute('aria-busy', 'true');
  message(formNotice, '');
  try {
    const data = await api('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, submission_key: submissionKey }) });
    form.hidden = true;
    message(formNotice, data.message, 'success');
    formNotice.tabIndex = -1; formNotice.focus();
  } catch (error) { message(formNotice, error.message, 'error'); }
  finally { submitting = false; button.disabled = false; button.textContent = 'Submit review'; form.removeAttribute('aria-busy'); }
});
