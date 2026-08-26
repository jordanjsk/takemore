const BACKEND_URL = window.location.port === '5500' || window.location.port === '3000'
    ? 'http://127.0.0.1:5000'
    : 'https://takemore.onrender.com';

const API_URL = `${BACKEND_URL}/api`;
const STATIC_URL = `${BACKEND_URL}/static/uploads`;

// --- CONFIGURATION SÉCURITÉ GLOBALE (SESSIONS + CSRF) ---
const originalFetch = window.fetch;
window.fetch = async function(resource, config) {
    if (!config) config = {};
    
    // 1. Ajouter systématiquement credentials pour envoyer les cookies de session
    config.credentials = 'include';
    
    // 2. Ajouter le token CSRF pour les requêtes de modification
    if (config.method && ['POST', 'PUT', 'DELETE'].includes(config.method.toUpperCase())) {
        const csrfToken = sessionStorage.getItem('csrf_token');
        if (csrfToken) {
            if (!config.headers) config.headers = {};
            config.headers['X-CSRFToken'] = csrfToken;
        }
    }
    
    return originalFetch(resource, config);
};

let products = [];
let cart = [];
let currentUserType = 'user';
let currentUser = null;

// Admin Pagination State
let adminProductsPage = 1;
let adminOrdersPage = 1;
let adminUsersPage = 1;
const ADMIN_ITEMS_PER_PAGE = 8;

// Load cart from localStorage
function loadCartFromStorage() {
    const savedCart = localStorage.getItem('takemore_cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCartCount();
    }
}

// Save cart to localStorage
function saveCartToStorage() {
    localStorage.setItem('takemore_cart', JSON.stringify(cart));
}

// Toast Notification System
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    
    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Form Validation
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRequired(value, fieldName) {
    if (!value || value.trim() === '') {
        showToast(`Le champ ${fieldName} est requis`, 'error');
        return false;
    }
    return true;
}

function validateNumber(value, fieldName, min = null, max = null) {
    const num = parseFloat(value);
    if (isNaN(num)) {
        showToast(`Le champ ${fieldName} doit être un nombre`, 'error');
        return false;
    }
    if (min !== null && num < min) {
        showToast(`Le champ ${fieldName} doit être au moins ${min}`, 'error');
        return false;
    }
    if (max !== null && num > max) {
        showToast(`Le champ ${fieldName} doit être au plus ${max}`, 'error');
        return false;
    }
    return true;
}

// Loading State
function setButtonLoading(button, loading) {
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

// API Error Handler
function handleApiError(error, defaultMessage = 'Une erreur est survenue') {
    console.error('API Error:', error);
    showToast(defaultMessage, 'error');
}

// Initialize cart from storage on load
document.addEventListener('DOMContentLoaded', async () => {
    // Récupérer le token CSRF au démarrage
    try {
        const response = await fetch(`${API_URL}/csrf-token`);
        if (response.ok) {
            const data = await response.json();
            if (data.csrf_token) {
                sessionStorage.setItem('csrf_token', data.csrf_token);
            }
        }
    } catch (e) {
        console.error("Erreur lors de la récupération du token CSRF:", e);
    }

    loadCartFromStorage();
});

async function loadProducts() {
    try {
        const response = await fetch(`${API_URL}/products`);
        if (!response.ok) throw new Error('Failed to load products');
        products = await response.json();
    } catch (error) {
        console.error('Erreur chargement produits:', error);
        showToast('Erreur lors du chargement des produits', 'error');
    }
}

// Public Site Functions
function displayPublicProducts(filteredProducts = null) {
    const grid = document.getElementById('publicProductGrid');
    if (!grid) return;
    
    let productsToDisplay = filteredProducts || products;
    productsToDisplay = filterByPrice(productsToDisplay);
    const paginatedProducts = paginateProducts(productsToDisplay);
    
    if (paginatedProducts.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <h3>Aucun produit trouvé</h3>
                <p>Essayez de modifier vos filtres de recherche</p>
                <button class="btn btn-primary" onclick="resetFilters(); searchProducts();">Réinitialiser les filtres</button>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = paginatedProducts.map(product => `
        <div class="pub-product-card" onclick="showProductDetail(${product.id})" style="position: relative;">
            ${getProductBadge(product)}
            <button class="wishlist-btn ${isInWishlist(product.id) ? 'active' : ''}" onclick="toggleWishlist(${product.id}, event)">
                ${isInWishlist(product.id) ? '❤️' : '🤍'}
            </button>
            <button class="compare-btn" onclick="addToCompare(${product.id}, event)" title="Comparer" style="position:absolute;top:50px;right:10px;width:36px;height:36px;border-radius:50%;background:white;border:none;box-shadow:var(--shadow-sm);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;z-index:5;transition:var(--transition);">
                ${isInCompare(product.id) ? '✓' : '⚖'}
            </button>
            <img src="${getProductImage(product)}" alt="${product.name}">
            <div class="pub-product-info">
                <h3>${product.name}</h3>
                <div class="pub-product-rating">${'★'.repeat(Math.floor(product.rating))} ${product.rating}</div>
                <div class="pub-product-price">$${product.price}</div>
                <button class="pub-add-cart" onclick="event.stopPropagation(); addToCart(${product.id}); animateAddToCart(this);">Ajouter au panier</button>
            </div>
        </div>
    `).join('');
    
    renderPagination(productsToDisplay.length);
}

function getProductImage(product) {
    if (!product.image) return 'https://via.placeholder.com/300?text=Produit';
    if (product.image.startsWith('http')) return product.image;
    return `${STATIC_URL}/${product.image}`;
}

// Search Products
function searchProducts(e, category = null) {
    if (e) e.preventDefault();
    
    let searchTerm = category !== null ? category : (document.getElementById('searchInput')?.value || '').toLowerCase();
    
    if (!searchTerm && !category) {
        displayPublicProducts();
        return;
    }
    
    const filtered = products.filter(product => 
        product.name.toLowerCase().includes(searchTerm) ||
        product.category.toLowerCase().includes(searchTerm) ||
        (product.description && product.description.toLowerCase().includes(searchTerm))
    );
    
    displayPublicProducts(filtered);
    
    // Scroll to products section
    document.querySelector('.pub-products').scrollIntoView({ behavior: 'smooth' });
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        const existingItem = cart.find(item => item.id === productId);
        if (existingItem) {
            existingItem.qty = (existingItem.qty || 1) + 1;
            showToast(`${product.name} quantité mise à jour`, 'info');
        } else {
            cart.push({...product, qty: 1});
            showToast(`${product.name} ajouté au panier`, 'success');
        }
        updateCartCount();
        saveCartToStorage();
        showCart();
    }
}

function updateCartCount() {
    const counts = document.querySelectorAll('.pub-cart-count, .cart-count');
    const totalItems = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    counts.forEach(el => {
        if (el) el.textContent = totalItems;
    });
}

// Cart Functions
function showCart() {
    const cartModal = document.getElementById('cartModal');
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    const cartFooter = document.querySelector('.cart-footer'); // Ajout pour contrôler le footer
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart">Votre panier est vide</p>';
        cartTotal.textContent = '$0.00';
        if (cartFooter) cartFooter.style.display = 'none'; // Masquer le bouton de commande si vide
    } else {
        cartItems.innerHTML = cart.map((item, index) => `
            <div class="cart-item">
                <img src="${getProductImage(item)}" alt="${item.name}">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <div class="price">$${item.price}</div>
                </div>
                <div class="cart-item-qty">
                    <button onclick="updateQty(${index}, -1)">-</button>
                    <span>${item.qty || 1}</span>
                    <button onclick="updateQty(${index}, 1)">+</button>
                </div>
                <button class="cart-item-remove" onclick="removeFromCart(${index})">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `).join('');
        
        const total = cart.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
        cartTotal.textContent = `$${total.toFixed(2)}`;
        if (cartFooter) cartFooter.style.display = 'flex'; // Afficher le bouton de commande
    }
    
    cartModal.classList.add('active');
}

function updateQty(index, change) {
    cart[index].qty = (cart[index].qty || 1) + change;
    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    }
    updateCartCount();
    saveCartToStorage();
    showCart();
}

function removeFromCart(index) {
    const removedItem = cart[index];
    cart.splice(index, 1);
    updateCartCount();
    saveCartToStorage();
    showCart();
    if (removedItem) {
        showToast(`${removedItem.name} retiré du panier`, 'info');
    }
}

function closeCart() {
    document.getElementById('cartModal').classList.remove('active');
}

function checkout() {
    if (!currentUser) {
        showToast('Vous devez être connecté pour passer une commande', 'warning');
        closeCart();
        showAuth();
        return;
    }
    
    if (currentUser.id === 1 || currentUser.role === 'admin') {
        showToast('Le compte Administrateur ne peut pas passer de commande.', 'error');
        return;
    }
    
    if (cart.length === 0) {
        showToast('Votre panier est vide', 'warning');
        return;
    }
    closeCart();
    const total = cart.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
    document.getElementById('checkoutTotal').textContent = `$${total.toFixed(2)}`;
    document.getElementById('checkoutModal').classList.add('active');
}

function closeCheckout() {
    document.getElementById('checkoutModal').classList.remove('active');
}

async function confirmOrder() {
    const address = document.getElementById('deliveryAddress').value;
    const payment = document.getElementById('paymentMethod').value;
    const phone = document.getElementById('checkoutPhone').value;
    
    if (!address) {
        showToast('Veuillez entrer une adresse de livraison', 'warning');
        return;
    }
    
    if (!phone) {
        showToast('Veuillez entrer un numéro de téléphone valide (WhatsApp)', 'warning');
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
    
    try {
        const response = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: currentUser ? currentUser.id : 1,
                phone: phone,
                total: total,
                status: 'En attente',
                date: new Date().toISOString().split('T')[0],
                items: cart
            })
        });
        
        if (!response.ok) throw new Error('Order failed');
        
        showToast('Commande passée avec succès!', 'success');
        cart = [];
        saveCartToStorage();
        updateCartCount();
        closeCheckout();
    } catch (error) {
        alert('Erreur lors de la commande');
    }
}

// Add click handler for cart
document.addEventListener('DOMContentLoaded', () => {
    const cartLinks = document.querySelectorAll('.pub-cart');
    cartLinks.forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            showCart();
        });
    });
});

function updateCartCount() {
    const counts = document.querySelectorAll('.pub-cart-count, .cart-count');
    const totalItems = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    counts.forEach(el => {
        if (el) el.textContent = totalItems;
    });
}

// Navigation & Auth
function showAuth() {
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('publicSite').classList.add('hidden');
    document.getElementById('adminLayout').classList.remove('active');
}

function showPublicSite() {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('publicSite').classList.remove('hidden');
    document.getElementById('adminLayout').classList.remove('active');
}

function showLogin(type) {
    currentUserType = type;
    const buttons = document.querySelectorAll('.login-toggle button');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Hide register form when switching to admin
    if (type === 'admin') {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('authToggleLink').style.display = 'none';
    } else {
        document.getElementById('authToggleLink').style.display = 'block';
    }
}

function toggleAuthForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const toggleLink = document.getElementById('authToggleLink');
    
    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        toggleLink.textContent = "Pas de compte ? S'inscrire";
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        toggleLink.textContent = "Déjà un compte ? Se connecter";
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, email, password})
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Inscription réussie! Connexion automatique...');
            currentUser = {id: data.id, name: data.name, email: email, role: data.role};
            currentUserType = 'user';
            updateAccountButton();
            document.getElementById('authPage').style.display = 'none';
            showPublicSite();
            showToast('Vous êtes maintenant connecté', 'success');
        } else {
            alert(data.message || 'Erreur lors de l\'inscription');
        }
    } catch (error) {
        alert('Erreur lors de l\'inscription');
    }
}

// Modal click handlers
document.addEventListener('DOMContentLoaded', () => {
    // Order detail modal
    const orderModal = document.getElementById('orderDetailModal');
    if (orderModal) {
        orderModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                closeOrderDetail();
            }
        });
    }
});

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, password})
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = {id: data.id, name: data.name, email: email, role: data.role};
            updateAccountButton();
            updateAdminHeader();
            
            if (data.role === 'admin') {
                showToast('Connexion administrateur réussie', 'success');
                document.getElementById('authPage').style.display = 'none';
                document.getElementById('adminLayout').classList.add('active');
                initAdminDashboard();
            } else {
                showToast('Connexion réussie', 'success');
                showPublicSite();
            }
        } else {
            showToast('Email ou mot de passe incorrect', 'error');
        }
    } catch (error) {
        showToast('Erreur de connexion au serveur', 'error');
    }
}

function updateAdminHeader() {
    if (currentUser) {
        const avatar = document.querySelector('.admin-header .user-avatar');
        const userName = document.querySelector('.admin-header .user-info span');
        const userRole = document.querySelector('.admin-header .user-info small');
        
        if (avatar) avatar.textContent = currentUser.name.substring(0, 2).toUpperCase();
        if (userName) userName.textContent = currentUser.name;
        if (userRole) userRole.textContent = currentUser.role === 'admin' ? 'Administrateur' : 'Utilisateur';
    }
}

function handleAccountClick() {
    if (currentUser) {
        showUserProfile();
    } else {
        showAuth();
    }
}

function updateAccountButton() {
    const btn = document.getElementById('accountBtn');
    if (currentUser) {
        btn.innerHTML = `
            <div class="user-avatar">${currentUser.name.substring(0, 2).toUpperCase()}</div>
            <div class="user-info">
                <span>${currentUser.name}</span>
            </div>
        `;
    } else {
        btn.innerHTML = '👤 Mon compte';
    }
}

function showUserProfile() {
    const modal = document.getElementById('profileModal');
    document.getElementById('profileName').textContent = currentUser.name;
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileRole').textContent = currentUser.role === 'admin' ? 'Administrateur' : 'Client';
    document.getElementById('profileAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    
    // Load user orders
    loadUserProfile();
    modal.classList.add('active');
}

async function loadUserProfile() {
    try {
        const response = await fetch(`${API_URL}/orders`);
        const allOrders = await response.json();
        
        // Filter orders for current user (assuming user_id matches)
        const userOrders = allOrders;
        
        // Calculate stats
        const orderCount = userOrders.length;
        const totalSpent = userOrders.reduce((sum, order) => sum + order.total, 0);
        const pendingCount = userOrders.filter(o => o.status === 'En attente').length;
        
        document.getElementById('profileOrderCount').textContent = orderCount;
        document.getElementById('profileTotalSpent').textContent = `$${totalSpent.toFixed(2)}`;
        document.getElementById('profilePendingCount').textContent = pendingCount;
        
        // Display orders
        const ordersContainer = document.getElementById('profileOrders');
        if (userOrders.length === 0) {
            ordersContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Aucune commande</p>';
        } else {
            ordersContainer.innerHTML = userOrders.map(order => `
                <div class="profile-order-card">
                    <div class="order-header">
                        <div>
                            <strong>Commande #${order.id}</strong>
                            <span class="order-date">${order.date}</span>
                        </div>
                        <span class="status-badge ${order.status === 'En attente' ? 'pending' : order.status === 'En cours' ? 'processing' : order.status === 'Expédiée' ? 'shipped' : 'completed'}">${order.status}</span>
                    </div>
                    <div class="order-total">$${order.total}</div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Erreur chargement profil:', error);
    }
}

function closeProfile() {
    document.getElementById('profileModal').classList.remove('active');
}

function logout() {
    currentUser = null;
    updateAccountButton();
    closeProfile();
    showPublicSite();
}

// Admin Navigation
function setupNavigation() {
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            navigateToPage(page);
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

function navigateToPage(page) {
    const pages = ['dashboard', 'products', 'orders', 'users', 'categories', 'analytics', 'settings', 'carousel', 'pages'];
    const titles = {
        dashboard: 'Dashboard',
        products: 'Produits',
        orders: 'Commandes',
        users: 'Clients',
        categories: 'Catégories',
        analytics: 'Statistiques',
        settings: 'Paramètres',
        carousel: 'Carrousel',
        pages: 'Pages & Footer'
    };
    
    document.getElementById('pageTitle').textContent = titles[page];
    
    pages.forEach(p => {
        const pageEl = document.getElementById(p + 'Page');
        if (pageEl) {
            pageEl.style.display = p === page ? 'block' : 'none';
        }
    });
    
    // Load data for specific pages
    if (page === 'orders') displayOrders();
    if (page === 'users') loadUsers();
    if (page === 'categories') loadAllCategories();
    if (page === 'carousel') displayCarouselAdmin();
    if (page === 'pages') loadAdminPages();
}

function loadPage(page) {
    navigateToPage(page);
    const link = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
    if (link) {
        document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    }
}

// Admin Products
function displayAdminProducts() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    
    // Pagination logic
    const start = (adminProductsPage - 1) * ADMIN_ITEMS_PER_PAGE;
    const paginatedProducts = products.slice(start, start + ADMIN_ITEMS_PER_PAGE);
    const end = Math.min(start + ADMIN_ITEMS_PER_PAGE, products.length);
    
    tbody.innerHTML = paginatedProducts.map(product => `
        <tr>
            <td>
                <div class="product-cell">
                    <img src="${getProductImage(product)}" alt="${product.name}" loading="lazy">
                    <div>
                        <div class="product-name">${product.name}</div>
                        <div class="product-sku">SKU: PRD-${product.id}</div>
                    </div>
                </div>
            </td>
            <td>${product.category}</td>
            <td>$${product.price}</td>
            <td>${product.stock}</td>
            <td><span class="status-badge active">Actif</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn view" onclick="viewProduct(${product.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    <button class="action-btn edit" onclick="editProduct(${product.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="action-btn delete" onclick="deleteProduct(${product.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Update pagination info
    const infoEl = document.getElementById('adminProductsPaginationInfo');
    if (infoEl) {
        if (products.length === 0) {
            infoEl.textContent = 'Aucun produit trouvé';
        } else {
            infoEl.textContent = `Affichage de ${start + 1}-${end} sur ${products.length} produits`;
        }
    }
    
    // Render pagination buttons
    renderAdminPagination('adminProductsPaginationBtns', products.length, 'adminProducts');
}

function renderAdminPagination(containerId, totalItems, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const totalPages = Math.ceil(totalItems / ADMIN_ITEMS_PER_PAGE);
    let currentPage;
    let changeFunc;
    
    if (type === 'adminProducts') {
        currentPage = adminProductsPage;
        changeFunc = 'changeAdminProductsPage';
    } else if (type === 'adminOrders') {
        currentPage = adminOrdersPage;
        changeFunc = 'changeAdminOrdersPage';
    } else if (type === 'adminUsers') {
        currentPage = adminUsersPage;
        changeFunc = 'changeAdminUsersPage';
    }
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = `<button onclick="${changeFunc}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>←</button>`;
    
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="${changeFunc}(${i})">${i}</button>`;
    }
    
    html += `<button onclick="${changeFunc}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>→</button>`;
    
    container.innerHTML = html;
}

function changeAdminProductsPage(page) {
    adminProductsPage = page;
    displayAdminProducts();
}

function changeAdminOrdersPage(page) {
    adminOrdersPage = page;
    displayOrders();
}

function changeAdminUsersPage(page) {
    adminUsersPage = page;
    displayUsers();
}

async function deleteProduct(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce produit?')) {
        try {
            await fetch(`${API_URL}/products/${id}`, {method: 'DELETE'});
            await loadProducts();
            displayAdminProducts();
            displayPublicProducts();
        } catch (error) {
            alert('Erreur lors de la suppression');
        }
    }
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    
    document.getElementById('productName').value = product.name;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productCategory').value = product.category;
    document.getElementById('productDescription').value = product.description;
    
    document.getElementById('productImageFile').value = '';
    const imagePreview = document.getElementById('imagePreview');
    if (product.image) {
        imagePreview.src = `${API_URL}/static/uploads/${product.image}`;
        imagePreview.style.display = 'block';
    } else {
        imagePreview.style.display = 'none';
    }
    
    document.getElementById('productModal').dataset.currentImage = product.image || '';
    
    document.querySelector('#productModal h3').textContent = 'Modifier le produit';
    document.querySelector('#productModal .btn-primary').textContent = 'Modifier';
    document.querySelector('#productModal .btn-primary').onclick = () => updateProduct(id);
    
    openModal('editProduct');
}

async function updateProduct(id) {
    const name = document.getElementById('productName').value;
    const price = document.getElementById('productPrice').value;
    const stock = document.getElementById('productStock').value;
    const category = document.getElementById('productCategory').value;
    const description = document.getElementById('productDescription').value;
    const imageFile = document.getElementById('productImageFile').files[0];
    
    if (!name || !price || !stock) {
        alert('Veuillez remplir tous les champs obligatoires');
        return;
    }
    
    let imageName = document.getElementById('productModal').dataset.currentImage;
    
    try {
        if (imageFile) {
            const formData = new FormData();
            formData.append('file', imageFile);
            const uploadResponse = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadResponse.json();
            if (!uploadData.success) {
                alert("Erreur lors de l'upload de l'image");
                return;
            }
            imageName = uploadData.filename;
        }
        
        await fetch(`${API_URL}/products/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name, 
                price: parseFloat(price), 
                stock: parseInt(stock), 
                category, 
                description, 
                image: imageName, 
                rating: 4.5
            })
        });
        
        closeModal('editProduct');
        await loadProducts();
        displayAdminProducts();
        displayPublicProducts();
        alert('Produit modifié avec succès!');
        
        document.querySelector('#productModal h3').textContent = 'Ajouter un produit';
        document.querySelector('#productModal .btn-primary').textContent = 'Ajouter';
        document.querySelector('#productModal .btn-primary').onclick = addProduct;
        document.getElementById('imagePreview').style.display = 'none';
        document.getElementById('productImageFile').value = '';
    } catch (error) {
        alert('Erreur lors de la modification');
    }
}

function viewProduct(id) {
    const product = products.find(p => p.id === id);
    if (product) {
        alert(`${product.name}\nPrix: $${product.price}\nStock: ${product.stock}\nCatégorie: ${product.category}\n\n${product.description}`);
    }
}

// Modal Functions
function openModal(type) {
    document.getElementById('productModal').classList.add('active');
}

function closeModal(type) {
    document.getElementById('productModal').classList.remove('active');
}

if (document.getElementById('productModal')) {
    document.getElementById('productModal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal('addProduct');
        }
    });
}

// Load Dashboard Stats
async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const stats = await response.json();
        
        const statValues = document.querySelectorAll('.stat-value');
        if (statValues[0]) statValues[0].textContent = `$${stats.revenue.toLocaleString()}`;
        if (statValues[1]) statValues[1].textContent = stats.orders;
        if (statValues[2]) statValues[2].textContent = stats.products;
        if (statValues[3]) statValues[3].textContent = stats.users;
    } catch (error) {
        console.error('Erreur chargement stats:', error);
    }
}

// Load Orders and Update Notification Badge
let allOrders = [];

async function loadOrders() {
    try {
        const response = await fetch(`${BACKEND_URL}/admin/orders`);
        allOrders = await response.json();
        const pendingOrders = allOrders.filter(o => o.status.toLowerCase() === 'en attente').length;
        const badge = document.querySelector('.notification-badge');
        if (badge) {
            badge.textContent = pendingOrders;
            badge.style.display = pendingOrders > 0 ? 'flex' : 'none';
        }
        
        // Update displays
        displayDashboardOrders();
        displayOrders();
    } catch (error) {
        console.error('Erreur chargement commandes:', error);
    }
}

function showNotifications() {
    const modal = document.getElementById('notificationsModal');
    const list = document.getElementById('notificationsList');
    const pendingOrders = allOrders.filter(o => o.status === 'En attente');
    
    if (pendingOrders.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Aucune commande en attente</p>';
    } else {
        list.innerHTML = pendingOrders.map(order => `
            <div class="notification-item">
                <div class="notification-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
                </div>
                <div class="notification-content">
                    <h4>Commande #${order.id}</h4>
                    <p>Montant: $${order.total} - ${order.date}</p>
                </div>
                <span class="status-badge pending">${order.status}</span>
            </div>
        `).join('');
    }
    
    modal.classList.add('active');
}

function closeNotifications() {
    document.getElementById('notificationsModal').classList.remove('active');
}

// Load Categories
async function loadCategories() {
    try {
        const response = await fetch(`${API_URL}/categories`);
        const categories = await response.json();
        
        const categoryGrid = document.getElementById('categoriesGrid');
        if (categoryGrid) {
            if (categories.length === 0) {
                categoryGrid.innerHTML = '<p style="text-align: center; color: #999; padding: 40px; grid-column: 1/-1;">Aucune catégorie disponible</p>';
            } else {
                categoryGrid.innerHTML = categories.map(cat => `
                    <div class="pub-category-card" onclick="filterByCategory('${cat.name}')">
                        <div class="icon">${cat.icon}</div>
                        <h4>${cat.name}</h4>
                    </div>
                `).join('');
            }
        }
        
        // Update nav categories
        const navCategories = document.getElementById('navCategories');
        if (navCategories && categories.length > 0) {
            navCategories.innerHTML = `
                <a href="#" onclick="filterByCategory(''); return false;">Toutes les catégories</a>
                ${categories.map(cat => `<a href="#" onclick="filterByCategory('${cat.name}'); return false;">${cat.name}</a>`).join('')}
            `;
        }
        
        // Update product modal category select
        const categorySelect = document.getElementById('productCategory');
        if (categorySelect && categories.length > 0) {
            categorySelect.innerHTML = `
                <option value="">Sélectionnez une catégorie</option>
                ${categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('')}
            `;
        }
    } catch (error) {
        console.error('Erreur chargement catégories:', error);
    }
}

function filterByCategory(category) {
    if (!category) {
        displayPublicProducts();
    } else {
        const filtered = products.filter(p => p.category === category);
        displayPublicProducts(filtered);
    }
    document.querySelector('.pub-products').scrollIntoView({ behavior: 'smooth' });
}

// Add Product
async function addProduct() {
    const name = document.getElementById('productName').value;
    const price = document.getElementById('productPrice').value;
    const stock = document.getElementById('productStock').value;
    const category = document.getElementById('productCategory').value;
    const description = document.getElementById('productDescription').value;
    const imageFile = document.getElementById('productImageFile').files[0];
    
    if (!name || !price || !stock || !imageFile) {
        alert('Veuillez remplir tous les champs obligatoires');
        return;
    }
    
    try {
        // Upload image
        const formData = new FormData();
        formData.append('file', imageFile);
        
        const uploadResponse = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const uploadData = await uploadResponse.json();
        if (!uploadData.success) {
            alert('Erreur lors de l\'upload de l\'image');
            return;
        }
        
        // Create product
        await fetch(`${API_URL}/products`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name, 
                price: parseFloat(price), 
                stock: parseInt(stock), 
                category, 
                description, 
                image: uploadData.filename,
                rating: 4.5
            })
        });
        
        closeModal('addProduct');
        await loadProducts();
        displayAdminProducts();
        displayPublicProducts();
        alert('Produit ajouté avec succès!');
        document.getElementById('productImageFile').value = '';
        document.getElementById('imagePreview').style.display = 'none';
    } catch (error) {
        alert('Erreur lors de l\'ajout du produit');
    }
}

function previewImage(input) {
    const preview = document.getElementById('imagePreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// Orders Page Functions
function displayOrders() {
    const tbody = document.querySelector('#ordersPage tbody');
    if (!tbody) return;
    
    if (allOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <path d="M16 10a4 4 0 0 1-8 0"/>
                        </svg>
                        <h3>Aucune commande</h3>
                        <p>Les commandes apparaîtront ici</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    // Pagination logic
    const start = (adminOrdersPage - 1) * ADMIN_ITEMS_PER_PAGE;
    const paginatedOrders = allOrders.slice(start, start + ADMIN_ITEMS_PER_PAGE);
    const end = Math.min(start + ADMIN_ITEMS_PER_PAGE, allOrders.length);
    
    tbody.innerHTML = paginatedOrders.map(order => `
        <tr>
            <td><strong>#CMD-${String(order.id).padStart(3, '0')}</strong></td>
            <td>
                ${order.user && order.user.name ? `<div style="font-weight:600;">${order.user.name}</div><div style="color:var(--gray-500); font-size:0.85em;">📞 ${order.user.phone || 'N/A'}</div><div style="color:var(--gray-500); font-size:0.85em;">✉️ ${order.user.email !== 'N/A' ? order.user.email : ''}</div>` : `Client #${order.user_id}`}
            </td>
            <td>${order.created_at || 'N/A'}</td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${order.items && order.items.length > 0 ? order.items.slice(0, 3).map(item => `
                        <img src="${STATIC_URL}/${item.image_url}" style="width:30px; height:30px; border-radius:4px; object-fit:cover;" title="${item.name} (x${item.quantity})">
                    `).join('') : '<span style="color:var(--gray-500);font-size:12px;">0 produit</span>'}
                    ${order.items && order.items.length > 3 ? `<span style="font-size:12px; font-weight:bold; color:var(--primary); background:var(--gray-100); padding:2px 6px; border-radius:10px;">+${order.items.length - 3}</span>` : ''}
                </div>
            </td>
            <td><strong>$${order.total_price ? order.total_price.toFixed(2) : '0.00'}</strong></td>
            <td><span class="status-badge ${order.status.toLowerCase() === 'en attente' ? 'pending' : order.status.toLowerCase() === 'en cours' ? 'processing' : order.status.toLowerCase() === 'livrée' ? 'completed' : 'shipped'}">${order.status}</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn view" onclick="viewOrder(${order.id})" title="Voir détails">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="action-btn view" onclick="downloadInvoice(${order.id})" title="Facture PDF" style="background:#f0f9ff; color:#0284c7;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </button>
                    <button class="action-btn" onclick="validateAndWhatsApp(${order.id})" title="Valider & WhatsApp" style="background:#dcfce3; color:#166534;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                    </button>
                    <button class="action-btn delete" onclick="deleteOrder(${order.id})" title="Supprimer">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // Update pagination info
    const infoEl = document.getElementById('adminOrdersPaginationInfo');
    if (infoEl) {
        if (allOrders.length === 0) {
            infoEl.textContent = 'Aucune commande trouvée';
        } else {
            infoEl.textContent = `Affichage de ${start + 1}-${end} sur ${allOrders.length} commandes`;
        }
    }
    
    // Render pagination buttons
    renderAdminPagination('adminOrdersPaginationBtns', allOrders.length, 'adminOrders');
}

let currentOrderId = null;

function viewOrder(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    
    currentOrderId = id;
    document.getElementById('orderDetailId').textContent = String(order.id).padStart(3, '0');
    document.getElementById('orderDetailDate').textContent = order.created_at || 'N/A';
    document.getElementById('orderDetailClient').textContent = order.user ? `${order.user.name} (${order.user.email})` : `Client #${order.user_id}`;
    document.getElementById('orderDetailTotal').textContent = `$${order.total_price ? order.total_price.toFixed(2) : '0.00'}`;
    
    // Convert current status to be compatible with options if 'Livrée' matches
    let statusVal = order.status;
    if(statusVal.toLowerCase() === 'livrée' || statusVal.toLowerCase() === 'livree') {
        const selectMap = Array.from(document.getElementById('orderStatusSelect').options).map(o => o.value);
        if(!selectMap.includes(statusVal)) {
            // Add 'Livrée' dynamically if it's somehow missing, or map it.
            statusVal = 'Livrée';
        }
    }
    document.getElementById('orderStatusSelect').value = statusVal;
    
    document.getElementById('orderDetailItems').innerHTML = order.items && order.items.length > 0 ? 
        order.items.map(item => `
            <div class="order-item" style="display:flex; align-items:center; gap:15px; padding:10px; border-bottom:1px solid var(--gray-200);">
                <img src="${STATIC_URL}/${item.image_url}" alt="${item.name}" style="width:60px; height:60px; object-fit:cover; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <div class="order-item-info" style="flex:1;">
                    <h5 style="margin:0 0 5px 0; font-size:15px; color:var(--dark);">${item.name}</h5>
                    <p style="margin:0; font-size:14px; color:var(--gray-600);">Quantité: <strong>${item.quantity || 1}</strong> × $${item.price.toFixed(2)} = <strong style="color:var(--primary)">$${((item.quantity || 1) * item.price).toFixed(2)}</strong></p>
                </div>
            </div>
        `).join('') : '<p style="color: var(--gray-500);text-align:center;padding:20px;">Aucun produit dans cette commande</p>';

    
    document.getElementById('orderDetailModal').classList.add('active');
}

function closeOrderDetail() {
    document.getElementById('orderDetailModal').classList.remove('active');
    currentOrderId = null;
}

async function saveOrderStatus() {
    if (!currentOrderId) return;
    
    const newStatus = document.getElementById('orderStatusSelect').value;
    
    try {
        await fetch(`${BACKEND_URL}/admin/orders/${currentOrderId}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status: newStatus})
        });
        
        await loadOrders();
        displayOrders();
        displayDashboardOrders();
        closeOrderDetail();
        alert('Statut mis à jour avec succès!');
    } catch (error) {
        alert('Erreur lors de la mise à jour');
    }
}

function displayDashboardOrders() {
    const tbody = document.getElementById('dashboardOrdersTableBody');
    if (!tbody) return;
    
    // Take the 5 most recent orders for dashboard
    const recentOrders = allOrders.slice(0, 5);
    
    if (recentOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Aucune commande</td></tr>';
        return;
    }
    
    tbody.innerHTML = recentOrders.map(order => `
        <tr>
            <td><strong>#CMD-${String(order.id).padStart(3, '0')}</strong></td>
            <td>${order.user && order.user.name ? order.user.name : `Client #${order.user_id}`}</td>
            <td>${order.created_at || 'N/A'}</td>
            <td><strong>$${(order.total_price || 0).toFixed(2)}</strong></td>
            <td><span class="status-badge ${order.status.toLowerCase() === 'en attente' ? 'pending' : (order.status.toLowerCase() === 'en cours' ? 'processing' : (order.status.toLowerCase() === 'livrée' ? 'completed' : 'shipped'))}">${order.status}</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn view" onclick="viewOrder(${order.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    <button class="action-btn edit" onclick="viewOrder(${order.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Update dashboard pagination info (minimal)
    const infoEl = document.getElementById('dashboardPaginationInfo');
    if (infoEl) {
        infoEl.textContent = `Affichage des 5 dernières commandes sur ${allOrders.length}`;
    }
}

async function editOrderStatus(id) {
    const order = allOrders.find(o => o.id === id);
    const statuses = ['En attente', 'En cours', 'Expédiée', 'Livrée'];
    const newStatus = prompt(`Changer le statut de la commande #${id}\nStatut actuel: ${order.status}\n\nNouveau statut (${statuses.join(', ')}):`, order.status);
    
    if (newStatus && statuses.includes(newStatus)) {
        try {
            await fetch(`${BACKEND_URL}/admin/orders/${id}/status`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({status: newStatus})
            });
            await loadOrders();
            displayOrders();
            alert('Statut mis à jour!');
        } catch (error) {
            alert('Erreur lors de la mise à jour');
        }
    }
}

async function deleteOrder(id) {
    if (confirm('Supprimer cette commande?')) {
        try {
            await fetch(`${API_URL}/orders/${id}`, {method: 'DELETE'});
            await loadOrders();
            displayOrders();
            alert('Commande supprimée!');
        } catch (error) {
            alert('Erreur lors de la suppression');
        }
    }
}

function exportOrdersExcel() {
    window.location.href = `${BACKEND_URL}/admin/orders/export/excel`;
}

function downloadInvoice(id) {
    window.location.href = `${BACKEND_URL}/admin/orders/${id}/invoice`;
}

function createNewOrder() {
    const total = prompt('Montant de la commande ($):');
    if (total) {
        // Add dummy items if products exist for testing purposes
        const mockItems = products.length > 0 ? [{
            id: products[0].id,
            product_id: products[0].id,
            qty: 1,
            price: parseFloat(total)
        }] : [];
        
        const adminUserFallback = allUsers.find(u => u.role !== 'admin' && u.id !== 1);
        if (!adminUserFallback) {
            alert('Veuillez d\'abord enregistrer un vrai client (ID >= 2) pour simuler une commande.');
            return;
        }
        
        fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: adminUserFallback.id, // Assign to a real client in DB
                total: parseFloat(total),
                status: 'En attente',
                date: new Date().toISOString().split('T')[0],
                items: mockItems
            })
        }).then(() => {
            loadOrders();
            displayOrders();
            alert('Commande test créée avec des produits !');
        });
    }
}

// Users/Clients Functions
let allUsers = [];

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/users`);
        allUsers = await response.json();
        displayUsers();
    } catch (error) {
        console.error('Erreur chargement utilisateurs:', error);
    }
}

function displayUsers() {
    const tbody = document.querySelector('#usersPage tbody');
    if (!tbody) return;
    
    // Pagination logic
    const start = (adminUsersPage - 1) * ADMIN_ITEMS_PER_PAGE;
    const paginatedUsers = allUsers.slice(start, start + ADMIN_ITEMS_PER_PAGE);
    const end = Math.min(start + ADMIN_ITEMS_PER_PAGE, allUsers.length);
    
    tbody.innerHTML = paginatedUsers.map(user => `
        <tr>
            <td>
                <div class="product-cell">
                    <div class="user-avatar">${user.name.substring(0, 2).toUpperCase()}</div>
                    <div>
                        <div class="product-name">${user.name}</div>
                        <div class="product-sku">ID: ${user.id}</div>
                    </div>
                </div>
            </td>
            <td>${user.email}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td><span class="status-badge active">${user.role}</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn view" onclick="viewUser(${user.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>
            </td>
        </tr>
    `).join('');

    // Update pagination info
    const infoEl = document.getElementById('adminUsersPaginationInfo');
    if (infoEl) {
        if (allUsers.length === 0) {
            infoEl.textContent = 'Aucun client trouvé';
        } else {
            infoEl.textContent = `Affichage de ${start + 1}-${end} sur ${allUsers.length} clients`;
        }
    }
    
    // Render pagination buttons
    renderAdminPagination('adminUsersPaginationBtns', allUsers.length, 'adminUsers');
}

function viewUser(id) {
    const user = allUsers.find(u => u.id === id);
    if (user) {
        alert(`Utilisateur: ${user.name}\nEmail: ${user.email}\nRôle: ${user.role}`);
    }
}

function addClient() {
    alert('Fonction d\'ajout de client\n\nPour ajouter un client, utilisez la page d\'inscription publique.');
}

// Categories Functions
let allCategories = [];

async function loadAllCategories() {
    try {
        const response = await fetch(`${API_URL}/categories`);
        allCategories = await response.json();
        displayCategoriesAdmin();
    } catch (error) {
        console.error('Erreur chargement catégories:', error);
    }
}

function displayCategoriesAdmin() {
    const tbody = document.querySelector('#categoriesPage tbody');
    if (!tbody) return;
    
    tbody.innerHTML = allCategories.map(cat => `
        <tr>
            <td>${cat.icon} ${cat.name}</td>
            <td>${cat.name.toLowerCase()}</td>
            <td>-</td>
            <td><span class="status-badge active">Active</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn delete" onclick="deleteCategory(${cat.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function addCategory() {
    const name = prompt('Nom de la catégorie:');
    const icon = prompt('Emoji/Icône:', '📦');
    
    if (name && icon) {
        fetch(`${API_URL}/categories`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, icon})
        }).then(() => {
            loadAllCategories();
            loadCategories();
            alert('Catégorie ajoutée!');
        });
    }
}

async function deleteCategory(id) {
    if (confirm('Supprimer cette catégorie?')) {
        try {
            await fetch(`${API_URL}/categories/${id}`, {method: 'DELETE'});
            await loadAllCategories();
            await loadCategories();
            alert('Catégorie supprimée!');
        } catch (error) {
            alert('Erreur lors de la suppression');
        }
    }
}

// Settings Functions
function saveSettings() {
    alert('Paramètres sauvegardés avec succès!');
}

function cancelSettings() {
    if (confirm('Annuler les modifications?')) {
        alert('Modifications annulées');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadProducts();
    await loadCategories();
    await loadDashboardStats();
    await loadOrders();
    await loadCarousel();
    displayPublicProducts();
    displayAdminProducts();
    setupNavigation();
});

// Carousel Functions
let carouselSlides = [];
let currentSlide = 0;

async function loadCarousel() {
    try {
        const response = await fetch(`${API_URL}/carousel`);
        carouselSlides = await response.json();
        displayCarousel();
        displayCarouselAdmin();
    } catch (error) {
        console.error('Erreur chargement carrousel:', error);
    }
}

function displayCarousel() {
    const container = document.getElementById('carouselSlides');
    if (!container || carouselSlides.length === 0) return;
    
    container.innerHTML = carouselSlides.map((slide, index) => `
        <div class="carousel-slide ${index === 0 ? 'active' : ''}">
            <img src="${STATIC_URL}/${slide.image}" alt="${slide.title}" loading="lazy">
        </div>
    `).join('');
    
    if (carouselSlides.length > 0) {
        document.getElementById('hero-title').textContent = carouselSlides[0].title;
        document.getElementById('hero-text').textContent = carouselSlides[0].text;
    }
}

function changeSlide(direction) {
    if (carouselSlides.length === 0) return;
    
    currentSlide = (currentSlide + direction + carouselSlides.length) % carouselSlides.length;
    
    const slides = document.querySelectorAll('.carousel-slide');
    slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === currentSlide);
    });
    
    document.getElementById('hero-title').textContent = carouselSlides[currentSlide].title;
    document.getElementById('hero-text').textContent = carouselSlides[currentSlide].text;
}

function displayCarouselAdmin() {
    const tbody = document.getElementById('carouselTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = carouselSlides.map(slide => `
        <tr>
            <td><img src="${STATIC_URL}/${slide.image}" style="width: 80px; height: 50px; object-fit: cover; border-radius: 4px;" loading="lazy"></td>
            <td>${slide.title}</td>
            <td>${slide.text}</td>
            <td>${slide.position}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn delete" onclick="deleteCarouselSlide(${slide.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openCarouselModal() {
    document.getElementById('carouselModal').classList.add('active');
}

function closeCarouselModal() {
    document.getElementById('carouselModal').classList.remove('active');
}

async function addCarouselSlide() {
    const title = document.getElementById('carouselTitle').value;
    const text = document.getElementById('carouselText').value;
    const imageFile = document.getElementById('carouselImageFile').files[0];
    const position = document.getElementById('carouselPosition').value;
    
    if (!title || !text || !imageFile) {
        alert('Veuillez remplir tous les champs');
        return;
    }
    
    try {
        // Upload image
        const formData = new FormData();
        formData.append('file', imageFile);
        
        const uploadResponse = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const uploadData = await uploadResponse.json();
        if (!uploadData.success) {
            alert('Erreur lors de l\'upload de l\'image');
            return;
        }
        
        await fetch(`${API_URL}/carousel`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title, text, image: uploadData.filename, position: parseInt(position)})
        });
        
        closeCarouselModal();
        await loadCarousel();
        alert('Slide ajoutée!');
        document.getElementById('carouselImageFile').value = '';
        document.getElementById('carouselImagePreview').style.display = 'none';
    } catch (error) {
        alert('Erreur lors de l\'ajout');
    }
}

function previewCarouselImage(input) {
    const preview = document.getElementById('carouselImagePreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function deleteCarouselSlide(id) {
    if (confirm('Supprimer cette slide?')) {
        try {
            await fetch(`${API_URL}/carousel/${id}`, {method: 'DELETE'});
            await loadCarousel();
            alert('Slide supprimée!');
        } catch (error) {
            alert('Erreur lors de la suppression');
        }
    }
}

// Auto-rotate carousel
setInterval(() => {
    if (carouselSlides.length > 1) {
        changeSlide(1);
    }
}, 5000);

// Product Detail Modal
function showProductDetail(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    
    addToRecentlyViewed(id);
    
    const img = document.getElementById('detailImage');
    img.src = getProductImage(product);
    img.dataset.productId = id;
    
    document.getElementById('detailName').textContent = product.name;
    document.getElementById('detailCategory').textContent = product.category;
    document.getElementById('detailPrice').textContent = `$${product.price}`;
    document.getElementById('detailStock').textContent = product.stock > 0 ? '✔ En stock' : '❌ Rupture de stock';
    document.getElementById('detailRating').textContent = `${product.rating}/5`;
    document.getElementById('tabDescription').textContent = product.description || 'Aucune description disponible';
    
    // Load specifications
    document.getElementById('tabSpecs').innerHTML = getProductSpecs(product);
    
    const addBtn = document.getElementById('detailAddToCart');
    addBtn.onclick = () => {
        addToCart(id);
        closeProductDetail();
    };
    
    loadReviews(id);
    document.getElementById('productDetailModal').classList.add('active');
}

function closeProductDetail() {
    document.getElementById('productDetailModal').classList.remove('active');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.add('active');
}

// Admin Dashboard Init
function initAdminDashboard() {
    loadDashboardStats();
    loadOrders();
    loadUsers();
    loadCarousel();
}

// Update dashboard stats with animation
function updateStatsDisplay(stats) {
    const statValues = document.querySelectorAll('.stat-value');
    if (statValues[0]) animateValue(statValues[0], 0, stats.revenue || 0, 1000, '$');
    if (statValues[1]) animateValue(statValues[1], 0, stats.orders || 0, 800, '');
    if (statValues[2]) animateValue(statValues[2], 0, stats.products || 0, 600, '');
    if (statValues[3]) animateValue(statValues[3], 0, stats.users || 0, 700, '');
}

function animateValue(obj, start, end, duration, prefix) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const value = Math.floor(progress * (end - start) + start);
        obj.textContent = prefix + value.toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Override original loadDashboardStats to use better display
const originalLoadDashboardStats = loadDashboardStats;
loadDashboardStats = async function() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const stats = await response.json();
        updateStatsDisplay(stats);
    } catch (error) {
        console.error('Erreur chargement stats:', error);
    }
};

async function validateAndWhatsApp(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    
    if (!order.user || !order.user.phone || order.user.phone === 'N/A') {
        alert("Ce client n'a pas de numéro de téléphone enregistré ou la commande est ancienne.");
        return;
    }
    
    let phoneNum = order.user.phone.replace(/[^0-9+]/g, '');
    if (phoneNum.startsWith('00')) phoneNum = '+' + phoneNum.substring(2);
    
    if (!confirm('Valider la commande et contacter via WhatsApp ?\\n\\nNuméro: ' + phoneNum)) {
        return;
    }
    
    try {
        await fetch(`${BACKEND_URL}/admin/orders/${id}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status: 'Validée'})
        });
        
        await loadOrders();
        displayOrders();
        
        let clientName = order.user.name.split(' (')[0];
        if (clientName.startsWith('Client #')) clientName = 'Client';
        
        let message = `Bonjour Mr/Mme ${clientName},\\n\\nVous avez commandé :\\n`;
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                message += `- ${item.name} (Quantité: ${item.quantity || 1}, Prix: ${item.price}$)\\n`;
            });
        }
        message += `\\nPour un total de : ${order.total_price ? order.total_price.toFixed(2) : '0.00'} $\\n\\n`;
        message += `Les délais de livraison sont compris entre 24 et 72 heures, avec une garantie de 7 jours.\\n\\nPouvons-nous procéder au paiement ?\\nMerci pour votre confiance.`;
        
        const encodedMessage = encodeURIComponent(message);
        const waUrl = `https://wa.me/${phoneNum.replace('+', '')}?text=${encodedMessage}`;
        
        const currentUserAdminDate = new Date().toLocaleString() + ' par ' + (currentUser ? currentUser.name : 'Admin');
        console.log(`Validation WhatsApp: Commande #${id} validée le ${currentUserAdminDate}`);
        
        window.open(waUrl, '_blank');
        
    } catch (error) {
        alert("Erreur lors de la validation de la commande.");
    }
}

// --- CMS Pages ---
let currentPages = [];

async function loadAdminPages() {
    try {
        const response = await fetch(`${API_URL}/pages`);
        currentPages = await response.json();
        
        const select = document.getElementById('pageSelect');
        select.innerHTML = '<option value="">-- Choisir une page --</option>' + 
            currentPages.map(p => `<option value="${p.slug}">${p.title} (${p.slug})</option>`).join('');
            
        document.getElementById('pageEditorSection').style.display = 'none';
    } catch (error) {
        console.error('Erreur de chargement des pages', error);
    }
}

function loadPageContent(slug) {
    if (!slug) {
        document.getElementById('pageEditorSection').style.display = 'none';
        return;
    }
    
    const page = currentPages.find(p => p.slug === slug);
    if (page) {
        document.getElementById('pageTitleInput').value = page.title;
        document.getElementById('pageContentInput').value = page.content;
        document.getElementById('pageEditorSection').style.display = 'block';
    }
}

async function savePageContent() {
    const slug = document.getElementById('pageSelect').value;
    if (!slug) return;
    
    const title = document.getElementById('pageTitleInput').value;
    const content = document.getElementById('pageContentInput').value;
    
    try {
        const response = await fetch(`${API_URL}/pages/${slug}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title, content})
        });
        
        const data = await response.json();
        if (data.success) {
            alert('Page mise à jour avec succès !');
            await loadAdminPages();
            document.getElementById('pageSelect').value = slug;
        } else {
            alert(data.error || 'Erreur lors de la sauvegarde');
        }
    } catch (error) {
        alert('Erreur réseau');
    }
}
