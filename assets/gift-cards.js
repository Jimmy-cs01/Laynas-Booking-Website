// Use the existing mobile menu behavior, with explicit accessible state.
const menu = document.getElementById('hamburger');
const navigation = document.getElementById('main-navigation');
const mobileNavigation = window.matchMedia('(max-width: 1100px)');
function closeMenu() {
  menu.classList.remove('open');
  navigation.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  navigation.inert = mobileNavigation.matches;
}
menu.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  navigation.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
  navigation.inert = mobileNavigation.matches && !open;
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.classList.contains('open')) {
    closeMenu();
    menu.focus();
  }
});
mobileNavigation.addEventListener('change', closeMenu);
closeMenu();
