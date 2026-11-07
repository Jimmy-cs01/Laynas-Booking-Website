export async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export function element(tag, text, className) {
  const node = document.createElement(tag);
  // All user content is inserted as text, never HTML.
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function reviewCard(review) {
  const article = element('article', undefined, 'review-card');
  const stars = element('p', '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating), 'stars');
  stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
  article.append(stars);
  if (review.title) article.append(element('h3', review.title));
  article.append(element('p', review.review_text, 'review-text'));
  const meta = element('div', undefined, 'review-meta');
  const date = element('time', new Date(review.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/New_York' }));
  date.dateTime = review.created_at;
  meta.append(element('span', review.client_name), date);
  article.append(meta);
  return article;
}

export function message(node, text, kind = '') {
  node.textContent = text;
  node.className = `message ${kind}`;
  node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}
