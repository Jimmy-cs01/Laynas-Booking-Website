import { ADMIN_PASSWORD_MIN_LENGTH, ADMIN_PASSWORD_MAX_LENGTH } from './security.js';

// This template is bundled into the Worker, outside the public asset directory.
export function adminPage(authenticated) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Review Administration | Beauty by Layna</title>
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/reviews.css">
  <script type="module" src="/assets/admin.js"></script>
</head>
<body class="reviews-page" data-authenticated="${authenticated}">
  <a class="skip-link" href="#main">Skip to content</a>
  <nav aria-label="Administration">
    <a href="/" class="logo">Beauty by Layna</a>
    <a href="/reviews" class="back-link">View client reviews</a>
  </nav>
  <header class="page-header"><h1>Review Admin</h1><p>A little care for every client's voice</p><div class="accent-line"></div></header>
  <main id="main" class="reviews-main">
    <p id="admin-message" class="message" role="status" aria-live="polite"></p>
    ${authenticated ? `
    <section id="dashboard" aria-label="Review moderation">
      <div class="admin-toolbar"><h2>Manage reviews</h2><div class="actions"><button class="btn" id="refresh" type="button">Refresh reviews</button><button class="btn" id="logout" type="button">Log out</button></div></div>
      <dl id="admin-stats" class="admin-stats" aria-label="Moderation summary"></dl>
      <div class="filter-bar" role="group" aria-label="Filter reviews">
        <button type="button" class="btn" data-status="pending" aria-pressed="true">Pending</button>
        <button type="button" class="btn" data-status="approved" aria-pressed="false">Approved</button>
        <button type="button" class="btn" data-status="rejected" aria-pressed="false">Rejected</button>
      </div>
      <h2 id="section-heading" class="list-heading">Pending reviews</h2>
      <div id="admin-reviews" class="review-grid" aria-live="polite"></div>
      <div class="pagination"><button type="button" class="btn" id="previous" disabled>Previous</button><span id="page-label">Page 1</span><button type="button" class="btn" id="next" disabled>Next</button></div>
    </section>` : `
    <section class="review-panel login-panel" aria-labelledby="login-heading">
      <h2 id="login-heading">Welcome back, Layna</h2>
      <p>Log in to approve and manage client reviews.</p>
      <form id="login-form" method="post" action="/admin">
        <label for="password">Administrator password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required minlength="${ADMIN_PASSWORD_MIN_LENGTH}" maxlength="${ADMIN_PASSWORD_MAX_LENGTH}">
        <button class="btn btn-filled" type="submit">Log in</button>
      </form>
    </section>`}
    <noscript><p class="message">Please enable JavaScript to manage reviews.</p></noscript>
  </main>
  <footer>© 2026 Beauty by Layna</footer>
</body>
</html>`;
}
