const state = {
  menu: [],
  category: 'All',
  search: '',
  cart: new Map(),
  token: localStorage.getItem('udupi-token'),
  user: null,
  authMode: 'login'
};

const $ = selector => document.querySelector(selector);
const money = amount => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2
}).format(Number(amount));

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('The server returned an unreadable response. Please try again.');
  }
  if (!response.ok || !result.success) {
    if (response.status === 401 && state.token) clearSession();
    const error = new Error(result.error?.message || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('visible'), 3000);
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error-message', isError);
}

function renderCategories() {
  const categories = ['All', ...new Set(state.menu.map(item => item.category))];
  $('#category-list').innerHTML = categories.map(category => `
    <button class="category-button${category === state.category ? ' active' : ''}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
  `).join('');
}

function renderMenu() {
  const search = state.search.trim().toLowerCase();
  const canOrder = state.user?.role !== 'ADMIN';
  const items = state.menu.filter(item => {
    const matchesCategory = state.category === 'All' || item.category === state.category;
    const matchesSearch = !search || `${item.name} ${item.description || ''} ${item.category}`.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
  const grid = $('#menu-grid');
  const status = $('#menu-status');
  if (!items.length) {
    grid.innerHTML = '<p class="empty-state">Nothing on the menu matches just yet. Try another search.</p>';
    setStatus(status, '');
    return;
  }
  setStatus(status, `${items.length} ${items.length === 1 ? 'dish' : 'dishes'} to make your day`);
  grid.innerHTML = items.map((item, index) => `
    <article class="menu-card">
      <div class="dish-art" data-category="${escapeHtml(item.category)}" aria-hidden="true">
        <span class="dish-garnish"></span><span class="dish-number">${String(index + 1).padStart(2, '0')}</span>
      </div>
      <div class="menu-card-content">
        <div class="card-meta"><span class="card-category">${escapeHtml(item.category)}</span><span class="veg-mark" aria-label="Vegetarian"></span></div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description || 'Freshly prepared in our kitchen.')}</p>
        <div class="card-footer">
          <span class="card-price">${money(item.price)}</span>
          ${item.is_available && canOrder
            ? `<button class="add-button" type="button" data-add="${escapeHtml(item.id)}"><span aria-hidden="true">＋</span> Add to bag</button>`
            : item.is_available ? '<span class="card-category">For customers</span>' : '<span class="unavailable">Sold out today</span>'}
        </div>
      </div>
    </article>
  `).join('');
}

async function loadMenu() {
  const status = $('#menu-status');
  try {
    const result = await api('/menu-items?limit=100');
    state.menu = result.data;
    renderCategories();
    renderMenu();
  } catch (error) {
    setStatus(status, error.message, true);
    $('#menu-grid').innerHTML = '';
  }
}

function updateCart() {
  const count = [...state.cart.values()].reduce((sum, item) => sum + item.quantity, 0);
  const total = [...state.cart.values()].reduce((sum, item) => sum + Number(item.menuItem.price) * item.quantity, 0);
  $('#bag-count').textContent = count;
  $('#cart-total').textContent = money(total);
  $('#cart-empty').classList.toggle('hidden', count > 0);
  $('#checkout-form').classList.toggle('hidden', count === 0);
  $('#cart-items').innerHTML = [...state.cart.values()].map(({ menuItem, quantity }) => `
    <article class="cart-line">
      <h3>${escapeHtml(menuItem.name)}</h3><span class="cart-line-price">${money(Number(menuItem.price) * quantity)}</span>
      <div class="quantity-control" aria-label="${escapeHtml(menuItem.name)} quantity">
        <button type="button" data-quantity="${escapeHtml(menuItem.id)}" data-change="-1" aria-label="Remove one">−</button>
        <span>${quantity}</span>
        <button type="button" data-quantity="${escapeHtml(menuItem.id)}" data-change="1" aria-label="Add one">+</button>
      </div>
      <span class="cart-line-price">${money(menuItem.price)} each</span>
    </article>
  `).join('');
}

function addToCart(id) {
  const menuItem = state.menu.find(item => String(item.id) === String(id));
  if (!menuItem || !menuItem.is_available) return;
  const existing = state.cart.get(String(id));
  state.cart.set(String(id), { menuItem, quantity: (existing?.quantity || 0) + 1 });
  updateCart();
  showToast(`${menuItem.name} added to your bag`);
}

function openCart() {
  $('#cart-panel').classList.add('open');
  $('#cart-panel').setAttribute('aria-hidden', 'false');
  $('#overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('#close-cart').focus();
}

function closeCart() {
  $('#cart-panel').classList.remove('open');
  $('#cart-panel').setAttribute('aria-hidden', 'true');
  $('#overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function updateAuthUI() {
  const accountButton = $('#account-button');
  const isLoggedIn = Boolean(state.user);
  accountButton.textContent = isLoggedIn ? state.user.full_name.split(' ')[0] : 'Sign in';
  const isCustomer = state.user?.role === 'CUSTOMER';
  const isAdmin = state.user?.role === 'ADMIN';
  $('#bag-button').classList.toggle('hidden', isAdmin);
  $('#orders-section').classList.toggle('hidden', !isCustomer);
  $('#admin-section').classList.toggle('hidden', !isAdmin);
  renderMenu();
  $('.auth-tabs').classList.toggle('hidden', isLoggedIn);
  $('.auth-form').classList.toggle('hidden', isLoggedIn);
  $('#logout-button').classList.toggle('hidden', !isLoggedIn);
  $('#auth-eyebrow').textContent = isLoggedIn ? 'YOUR ACCOUNT' : 'WELCOME TO OUR TABLE';
  $('#auth-title').innerHTML = isLoggedIn
    ? `Hello, <em>${escapeHtml(state.user.full_name.split(' ')[0])}.</em>`
    : 'Good to see <em>you.</em>';
  $('#auth-intro').textContent = isLoggedIn
    ? `${state.user.email} · ${state.user.role.toLowerCase()}`
    : 'Sign in to place an order and keep up with your favourites.';
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('udupi-token');
  updateAuthUI();
  $('#orders-list').innerHTML = '';
  $('#admin-orders-list').innerHTML = '';
}

function openAuth(mode = 'login') {
  state.authMode = mode;
  $('#auth-message').textContent = '';
  $('.auth-dialog').showModal();
  updateAuthMode();
  if (!state.user) $('#email').focus();
}

function updateAuthMode() {
  const isRegister = state.authMode === 'register';
  $('#login-tab').classList.toggle('active', !isRegister);
  $('#register-tab').classList.toggle('active', isRegister);
  $('#login-tab').setAttribute('aria-selected', String(!isRegister));
  $('#register-tab').setAttribute('aria-selected', String(isRegister));
  $('#name-field').classList.toggle('hidden', !isRegister);
  $('#phone-field').classList.toggle('hidden', !isRegister);
  $('#full-name').required = isRegister;
  $('#phone').required = isRegister;
  $('#password').autocomplete = isRegister ? 'new-password' : 'current-password';
  $('#auth-submit').innerHTML = `${isRegister ? 'Create my account' : 'Sign in'} <span aria-hidden="true">→</span>`;
  if (!state.user) {
    $('#auth-title').innerHTML = isRegister ? 'Pull up a <em>chair.</em>' : 'Good to see <em>you.</em>';
    $('#auth-intro').textContent = isRegister
      ? 'Create an account and your next favourite is just a few clicks away.'
      : 'Sign in to place an order and keep up with your favourites.';
  }
}

async function loadOrders() {
  const isAdmin = state.user?.role === 'ADMIN';
  const status = isAdmin ? $('#admin-orders-status') : $('#orders-status');
  const list = isAdmin ? $('#admin-orders-list') : $('#orders-list');
  try {
    const firstPage = await api('/orders?page=1&limit=100');
    const remainingPages = await Promise.all(
      Array.from({ length: Math.max(0, firstPage.meta.totalPages - 1) }, (_, index) =>
        api(`/orders?page=${index + 2}&limit=100`)
      )
    );
    const orders = [...firstPage.data, ...remainingPages.flatMap(page => page.data)];
    if (isAdmin) {
      list.innerHTML = orders.length ? orders.map(order => {
        const cancelled = Boolean(order.cancelled_at);
        const currentStatus = cancelled ? 'cancelled' : order.status;
        const createdAt = new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        return `
          <article class="admin-order-card">
            <div class="admin-order-details">
              <div class="admin-order-title"><h3>Order #${escapeHtml(order.id)}</h3><span class="order-status${cancelled ? ' cancelled' : ''}">${escapeHtml(currentStatus)}</span></div>
              <p><strong>${escapeHtml(order.customer_name)}</strong> · ${escapeHtml(order.phone)}</p>
              <p>${createdAt} · ${escapeHtml(order.payment_method.toUpperCase())}</p>
            </div>
            <div class="admin-order-action">
              <strong>${money(order.total_amount)}</strong>
              ${order.status === 'pending' && !cancelled
                ? `<button class="complete-order-button" type="button" data-complete-order="${escapeHtml(order.id)}">Mark Completed</button>`
                : ''}
            </div>
          </article>
        `;
      }).join('') : '<p class="empty-state">There are no orders yet.</p>';
      setStatus(status, `${orders.length} ${orders.length === 1 ? 'order' : 'orders'} found`);
      return;
    }
    list.innerHTML = orders.length ? orders.map(order => `
      <article class="order-card">
        <div>
          <h3>Order #${escapeHtml(order.id)}</h3>
          <p>${new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · ${escapeHtml(order.payment_method.toUpperCase())}</p>
        </div>
        <div class="order-right">
          <div><div class="order-total">${money(order.total_amount)}</div><span class="order-status${order.cancelled_at ? ' cancelled' : ''}">${order.cancelled_at ? 'cancelled' : escapeHtml(order.status)}</span></div>
        </div>
      </article>
    `).join('') : '<p class="empty-state">Your first order is waiting to happen. Browse the menu above to get started.</p>';
    setStatus(status, '');
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function restoreSession() {
  if (!state.token) {
    updateAuthUI();
    return;
  }
  try {
    const result = await api('/auth/me');
    state.user = result.data;
    updateAuthUI();
    await loadOrders();
  } catch (error) {
    if (error.status === 401) showToast('Your session expired. Please sign in again.');
  }
}

async function completeOrder(id, button) {
  button.disabled = true;
  try {
    await api(`/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' })
    });
    showToast(`Order #${id} marked completed.`);
    await loadOrders();
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

async function submitOrder(event) {
  event.preventDefault();
  if (!state.cart.size) return;
  if (state.user?.role === 'ADMIN') {
    $('#checkout-message').textContent = 'Admin accounts manage orders and cannot place customer orders.';
    return;
  }
  if (!state.user) {
    closeCart();
    openAuth();
    return;
  }
  const button = $('#checkout-button');
  const message = $('#checkout-message');
  button.disabled = true;
  message.textContent = '';
  try {
    const result = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({
        payment_method: $('#payment-method').value,
        items: [...state.cart.values()].map(({ menuItem, quantity }) => ({
          menu_item_id: Number(menuItem.id),
          quantity
        }))
      })
    });
    state.cart.clear();
    updateCart();
    closeCart();
    await loadOrders();
    if (state.user.role !== 'ADMIN') {
      $('#orders-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    showToast(`Order #${result.data.id} is in! We'll get cooking.`);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#auth-submit');
  const message = $('#auth-message');
  const isRegister = state.authMode === 'register';
  const data = Object.fromEntries(new FormData(form).entries());
  button.disabled = true;
  message.textContent = '';
  try {
    if (isRegister) {
      await api('/auth/register', { method: 'POST', body: JSON.stringify(data) });
    }
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: data.email, password: data.password })
    });
    state.token = result.data.token;
    state.user = result.data.user;
    localStorage.setItem('udupi-token', state.token);
    form.reset();
    updateAuthUI();
    $('.auth-dialog').close();
    await loadOrders();
    showToast(isRegister ? 'Welcome to the table!' : `Welcome back, ${state.user.full_name.split(' ')[0]}!`);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

$('#category-list').addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  state.category = button.dataset.category;
  renderCategories();
  renderMenu();
});

$('#menu-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-add]');
  if (button) addToCart(button.dataset.add);
});

$('#cart-items').addEventListener('click', event => {
  const button = event.target.closest('[data-quantity]');
  if (!button) return;
  const key = String(button.dataset.quantity);
  const item = state.cart.get(key);
  if (!item) return;
  item.quantity += Number(button.dataset.change);
  if (item.quantity <= 0) state.cart.delete(key);
  updateCart();
});

$('#admin-orders-list').addEventListener('click', event => {
  const button = event.target.closest('[data-complete-order]');
  if (button) completeOrder(button.dataset.completeOrder, button);
});

$('#refresh-admin-orders').addEventListener('click', loadOrders);

$('#search-input').addEventListener('input', event => {
  state.search = event.target.value;
  renderMenu();
});

$('#bag-button').addEventListener('click', openCart);
$('#close-cart').addEventListener('click', closeCart);
$('#browse-menu').addEventListener('click', closeCart);
$('#overlay').addEventListener('click', closeCart);
$('#checkout-form').addEventListener('submit', submitOrder);
$('#account-button').addEventListener('click', () => {
  openAuth();
  if (state.user) loadOrders();
});
$('#close-auth').addEventListener('click', () => $('.auth-dialog').close());
$('#login-tab').addEventListener('click', () => { state.authMode = 'login'; updateAuthMode(); });
$('#register-tab').addEventListener('click', () => { state.authMode = 'register'; updateAuthMode(); });
$('#auth-form').addEventListener('submit', submitAuth);
$('#logout-button').addEventListener('click', () => {
  clearSession();
  $('.auth-dialog').close();
  showToast('You have been signed out.');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeCart();
});

updateCart();
loadMenu();
restoreSession();
