// ===== ADVANCED FILTERS & SORTING =====
let currentFilters = {
    category: '',
    minPrice: 0,
    maxPrice: 10000,
    minRating: 0,
    sortBy: 'default'
};

function setupAdvancedFilters() {
    const container = document.getElementById('filtersContainer');
    if (!container) return;

    // Get unique categories from products
    const categories = [...new Set(products.map(p => p.category).filter(c => c))];

    container.innerHTML = `
        <div class="filters-section">
            <div class="filters-header">
                <h3>Filtres & Tri</h3>
                <button class="btn btn-sm btn-secondary" onclick="toggleFilters()">Masquer</button>
            </div>
            <div class="filters-grid" id="filtersGrid">
                <div class="filter-group">
                    <label>Catégorie</label>
                    <select id="filterCategory" onchange="applyFilters()">
                        <option value="">Toutes les catégories</option>
                        ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Prix min ($)</label>
                    <input type="number" id="filterMinPrice" value="0" min="0" onchange="applyFilters()">
                </div>
                <div class="filter-group">
                    <label>Prix max ($)</label>
                    <input type="number" id="filterMaxPrice" value="10000" min="0" onchange="applyFilters()">
                </div>
                <div class="filter-group">
                    <label>Note minimum</label>
                    <select id="filterRating" onchange="applyFilters()">
                        <option value="0">Toutes les notes</option>
                        <option value="4">4★ et plus</option>
                        <option value="3">3★ et plus</option>
                        <option value="2">2★ et plus</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Trier par</label>
                    <select id="sortBy" onchange="applyFilters()">
                        <option value="default">Par défaut</option>
                        <option value="price-asc">Prix: croissant</option>
                        <option value="price-desc">Prix: décroissant</option>
                        <option value="name-asc">Nom: A-Z</option>
                        <option value="name-desc">Nom: Z-A</option>
                        <option value="rating-desc">Meilleures notes</option>
                        <option value="newest">Plus récents</option>
                    </select>
                </div>
            </div>
            <div class="filter-actions">
                <button class="btn btn-secondary" onclick="resetFilters()">Réinitialiser</button>
                <button class="btn btn-primary" onclick="applyFilters()">Appliquer</button>
            </div>
        </div>
    `;
}

function toggleFilters() {
    const grid = document.getElementById('filtersGrid');
    if (grid) {
        grid.style.display = grid.style.display === 'none' ? 'grid' : 'none';
    }
}

function applyFilters() {
    currentFilters.category = document.getElementById('filterCategory')?.value || '';
    currentFilters.minPrice = parseFloat(document.getElementById('filterMinPrice')?.value) || 0;
    currentFilters.maxPrice = parseFloat(document.getElementById('filterMaxPrice')?.value) || 10000;
    currentFilters.minRating = parseFloat(document.getElementById('filterRating')?.value) || 0;
    currentFilters.sortBy = document.getElementById('sortBy')?.value || 'default';

    // Save to localStorage
    localStorage.setItem('takemore_filters', JSON.stringify(currentFilters));

    filterAndDisplayProducts();
}

function resetFilters() {
    currentFilters = {
        category: '',
        minPrice: 0,
        maxPrice: 10000,
        minRating: 0,
        sortBy: 'default'
    };

    document.getElementById('filterCategory').value = '';
    document.getElementById('filterMinPrice').value = 0;
    document.getElementById('filterMaxPrice').value = 10000;
    document.getElementById('filterRating').value = 0;
    document.getElementById('sortBy').value = 'default';

    localStorage.removeItem('takemore_filters');
    filterAndDisplayProducts();
}

function filterAndDisplayProducts() {
    let filtered = [...products];

    // Apply category filter
    if (currentFilters.category) {
        filtered = filtered.filter(p => p.category === currentFilters.category);
    }

    // Apply price filter
    filtered = filtered.filter(p => p.price >= currentFilters.minPrice && p.price <= currentFilters.maxPrice);

    // Apply rating filter
    if (currentFilters.minRating > 0) {
        filtered = filtered.filter(p => (p.rating || 0) >= currentFilters.minRating);
    }

    // Apply sorting
    switch (currentFilters.sortBy) {
        case 'price-asc':
            filtered.sort((a, b) => a.price - b.price);
            break;
        case 'price-desc':
            filtered.sort((a, b) => b.price - a.price);
            break;
        case 'name-asc':
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            filtered.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'rating-desc':
            filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            break;
        case 'newest':
            filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
            break;
    }

    currentPage = 1;
    displayPublicProducts(filtered);
    updateProductCount(filtered.length);
}

function updateProductCount(count) {
    const countEl = document.getElementById('productCountDisplay');
    if (countEl) {
        countEl.textContent = `${count} produit${count !== 1 ? 's' : ''}`;
    }
}

// ===== DARK MODE =====
function initDarkMode() {
    const savedTheme = localStorage.getItem('takemore_theme') || 'light';
    setTheme(savedTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('takemore_theme', theme);
}

function toggleDarkMode() {
    const currentTheme = localStorage.getItem('takemore_theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    showToast(newTheme === 'dark' ? 'Mode sombre activé' : 'Mode clair activé', 'info');
}

// ===== PRODUCT BADGES =====
function getProductBadge(product) {
    if (!product) return '';

    // Check if product is new (recently added - based on ID)
    const isNew = product.id > 80;

    // Check if on sale (random for demo)
    const isSale = product.id % 7 === 0;

    // Check if bestseller (high rating)
    const isBestseller = (product.rating || 0) >= 4.5;

    // Check low stock
    const isLowStock = (product.stock || 0) > 0 && (product.stock || 0) <= 5;

    let badges = '';
    if (isNew) badges += '<span class="product-badge new">Nouveau</span>';
    if (isSale) badges += '<span class="product-badge sale">Solde</span>';
    if (isBestseller) badges += '<span class="product-badge bestseller">Best-seller</span>';
    if (isLowStock) badges += '<span class="product-badge low-stock">Stock faible</span>';

    return badges;
}

// ===== SPECIFICATIONS TAB =====
function getProductSpecs(product) {
    if (!product) return '<p>Aucune spécification disponible</p>';

    const specs = [
        { label: 'Catégorie', value: product.category || 'N/A' },
        { label: 'Prix', value: `$${product.price}` },
        { label: 'Stock', value: product.stock > 0 ? `${product.stock} unités` : 'Rupture de stock' },
        { label: 'Note', value: `${product.rating || 0}/5` },
        { label: 'Garantie', value: '1 an' },
        { label: 'Livraison', value: 'Offerte' }
    ];

    return `
        <table class="specs-table">
            ${specs.map(s => `
                <tr>
                    <td>${s.label}</td>
                    <td>${s.value}</td>
                </tr>
            `).join('')}
        </table>
    `;
}

// ===== PRODUCT COMPARISON =====
let compareList = JSON.parse(localStorage.getItem('takemore_compare')) || [];
const MAX_COMPARE = 4;

function addToCompare(productId, event) {
    event.stopPropagation();

    if (compareList.includes(productId)) {
        removeFromCompare(productId);
        showToast('Produit retiré du comparateur', 'info');
        return;
    }

    if (compareList.length >= MAX_COMPARE) {
        showToast(`Maximum ${MAX_COMPARE} produits à comparer`, 'warning');
        return;
    }

    compareList.push(productId);
    localStorage.setItem('takemore_compare', JSON.stringify(compareList));
    showToast('Produit ajouté au comparateur', 'success');
    updateCompareBar();
}

function removeFromCompare(productId) {
    compareList = compareList.filter(id => id !== productId);
    localStorage.setItem('takemore_compare', JSON.stringify(compareList));
    updateCompareBar();
    displayPublicProducts();
}

function isInCompare(productId) {
    return compareList.includes(productId);
}

function updateCompareBar() {
    const bar = document.getElementById('compareBar');
    if (!bar) return;

    // Update count
    const countEl = document.getElementById('compareCount');
    if (countEl) {
        countEl.textContent = compareList.length;
    }

    if (compareList.length === 0) {
        bar.classList.remove('active');
        return;
    }

    bar.classList.add('active');

    const container = document.getElementById('compareBarItems');
    const compareProducts = products.filter(p => compareList.includes(p.id));

    container.innerHTML = compareProducts.map(p => `
        <div class="compare-bar-item">
            <img src="${getProductImage(p)}" alt="${p.name}">
            <button class="remove-compare" onclick="removeFromCompare(${p.id})">×</button>
        </div>
    `).join('');
}

function openCompareModal() {
    if (compareList.length < 2) {
        showToast('Ajoutez au moins 2 produits pour comparer', 'warning');
        return;
    }

    const modal = document.getElementById('compareModal');
    const compareProducts = products.filter(p => compareList.includes(p.id));

    // Set CSS variable for column count
    document.documentElement.style.setProperty('--compare-count', compareProducts.length);

    const container = document.getElementById('compareGridContent');
    container.innerHTML = `
        <div class="compare-cell header"></div>
        ${compareProducts.map(p => `
            <div class="compare-cell header">
                <img src="${getProductImage(p)}" alt="${p.name}">
                <div style="margin-top: 10px; font-weight: 600;">${p.name}</div>
            </div>
        `).join('')}
        
        <div class="compare-cell header">Prix</div>
        ${compareProducts.map(p => `<div class="compare-cell price">$${p.price}</div>`).join('')}
        
        <div class="compare-cell header">Catégorie</div>
        ${compareProducts.map(p => `<div class="compare-cell">${p.category || 'N/A'}</div>`).join('')}
        
        <div class="compare-cell header">Stock</div>
        ${compareProducts.map(p => `<div class="compare-cell">${p.stock > 0 ? `${p.stock} unités` : 'Rupture'}</div>`).join('')}
        
        <div class="compare-cell header">Note</div>
        ${compareProducts.map(p => `
            <div class="compare-cell">
                <div class="star-rating-display">
                    ${[1, 2, 3, 4, 5].map(i => `<span class="star ${i <= Math.round(p.rating || 0) ? 'filled' : ''}">★</span>`).join('')}
                </div>
            </div>
        `).join('')}
        
        <div class="compare-cell header">Description</div>
        ${compareProducts.map(p => `<div class="compare-cell" style="text-align: left; font-size: 13px;">${(p.description || '').substring(0, 100)}...</div>`).join('')}
        
        <div class="compare-cell header">Action</div>
        ${compareProducts.map(p => `
            <div class="compare-cell">
                <button class="btn btn-primary btn-sm" onclick="addToCart(${p.id}); showToast('Ajouté au panier', 'success');">Ajouter</button>
            </div>
        `).join('')}
    `;

    modal.classList.add('active');
}

function closeCompareModal() {
    document.getElementById('compareModal').classList.remove('active');
}

function clearCompare() {
    compareList = [];
    localStorage.removeItem('takemore_compare');
    updateCompareBar();
    showToast('Comparateur vidé', 'info');
}

// ===== PAGINATION =====
let currentPage = 1;
let itemsPerPage = parseInt(localStorage.getItem('itemsPerPage')) || 12;

function paginateProducts(products) {
    const start = (currentPage - 1) * itemsPerPage;
    return products.slice(start, start + itemsPerPage);
}

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const container = document.getElementById('paginationContainer');
    if (!container || totalPages <= 1) return;

    container.className = 'pagination';
    container.style.justifyContent = 'center';

    container.innerHTML = `
        <div class="pagination-btns">
            <button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>←</button>
            ${Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        const page = i + 1;
        return `<button class="${page === currentPage ? 'active' : ''}" onclick="changePage(${page})">${page}</button>`;
    }).join('')}
            <button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>→</button>
        </div>
    `;
}

function changePage(page) {
    currentPage = page;
    displayPublicProducts();
    document.querySelector('.pub-products').scrollIntoView({ behavior: 'smooth' });
}

function changeItemsPerPage(count) {
    itemsPerPage = count;
    localStorage.setItem('itemsPerPage', count);
    currentPage = 1;
    displayPublicProducts();
}

// ===== WISHLIST =====
let wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];

function toggleWishlist(productId, event) {
    event.stopPropagation();
    const index = wishlist.indexOf(productId);
    if (index > -1) {
        wishlist.splice(index, 1);
        showToast('Retiré des favoris', 'info');
    } else {
        wishlist.push(productId);
        showToast('Ajouté aux favoris', 'success');
    }
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    displayPublicProducts();
}

function isInWishlist(productId) {
    return wishlist.includes(productId);
}

// ===== REVIEWS =====
let currentProductReviews = [];

async function loadReviews(productId) {
    try {
        const response = await fetch(`${API_URL}/reviews/${productId}`);
        currentProductReviews = await response.json();
        displayReviews();
    } catch (error) {
        console.error('Erreur chargement avis:', error);
    }
}

function displayReviews() {
    const container = document.getElementById('tabReviews');
    if (!container) return;

    if (currentProductReviews.length === 0) {
        container.innerHTML = `
            <p style="color: #999; margin-bottom: 20px;">Aucun avis pour le moment</p>
            <button class="btn btn-primary" onclick="showReviewForm()">Laisser un avis</button>
        `;
        return;
    }

    container.innerHTML = `
        <div class="reviews-list">
            ${currentProductReviews.map(r => `
                <div class="review-item">
                    <div class="review-header">
                        <strong>${r.user_name}</strong>
                        <span class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    <p class="review-date">${r.date}</p>
                    <p class="review-comment">${r.comment}</p>
                </div>
            `).join('')}
        </div>
        <button class="btn btn-primary" onclick="showReviewForm()" style="margin-top: 20px;">Laisser un avis</button>
    `;
}

function showReviewForm() {
    const container = document.getElementById('tabReviews');
    container.innerHTML = `
        <div class="review-form">
            <h4>Laisser un avis</h4>
            <div class="star-rating" id="starRating">
                ${[1, 2, 3, 4, 5].map(i => `<span class="star" onclick="setRating(${i})">☆</span>`).join('')}
            </div>
            <textarea id="reviewComment" placeholder="Votre avis..." rows="4" style="width: 100%; margin: 15px 0; padding: 10px; border: 2px solid #E5E5E5; border-radius: 8px;"></textarea>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-primary" onclick="submitReview()">Envoyer</button>
                <button class="btn btn-secondary" onclick="displayReviews()">Annuler</button>
            </div>
        </div>
    `;
}

let selectedRating = 0;
function setRating(rating) {
    selectedRating = rating;
    const stars = document.querySelectorAll('#starRating .star');
    stars.forEach((star, i) => {
        star.textContent = i < rating ? '★' : '☆';
        star.style.color = i < rating ? '#FCA311' : '#ccc';
    });
}

async function submitReview() {
    const comment = document.getElementById('reviewComment').value;
    if (!selectedRating || !comment) {
        showToast('Veuillez donner une note et un commentaire', 'warning');
        return;
    }

    const productId = parseInt(document.getElementById('detailImage').dataset.productId);
    const userName = currentUser ? currentUser.name : 'Anonyme';

    try {
        await fetch(`${API_URL}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_id: productId,
                user_name: userName,
                rating: selectedRating,
                comment: comment,
                date: new Date().toISOString().split('T')[0]
            })
        });

        showToast('Avis ajouté avec succès!', 'success');
        await loadReviews(productId);
        selectedRating = 0;
    } catch (error) {
        showToast('Erreur lors de l\'ajout de l\'avis', 'error');
    }
}

// ===== RECENTLY VIEWED =====
let recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed')) || [];

function addToRecentlyViewed(productId) {
    recentlyViewed = recentlyViewed.filter(id => id !== productId);
    recentlyViewed.unshift(productId);
    recentlyViewed = recentlyViewed.slice(0, 10);
    localStorage.setItem('recentlyViewed', JSON.stringify(recentlyViewed));
}

function displayRecentlyViewed() {
    const container = document.getElementById('recentlyViewedContainer');
    if (!container || recentlyViewed.length === 0) return;

    const recentProducts = products.filter(p => recentlyViewed.includes(p.id)).slice(0, 6);
    container.innerHTML = `
        <h3>Récemment consultés</h3>
        <div class="recent-grid">
            ${recentProducts.map(p => `
                <div class="pub-product-card" onclick="showProductDetail(${p.id})">
                    <img src="${getProductImage(p)}" alt="${p.name}">
                    <div class="pub-product-info">
                        <h3>${p.name}</h3>
                        <div class="pub-product-price">$${p.price}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ===== SEARCH AUTOCOMPLETE =====
let searchTimeout;
function setupSearchAutocomplete() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const term = e.target.value.toLowerCase();
            if (term.length < 2) return;

            const suggestions = products
                .filter(p => p.name.toLowerCase().includes(term))
                .slice(0, 5);

            showSearchSuggestions(suggestions);
        }, 300);
    });
}

function showSearchSuggestions(suggestions) {
    let container = document.getElementById('searchSuggestions');
    if (!container) {
        container = document.createElement('div');
        container.id = 'searchSuggestions';
        container.className = 'search-suggestions';
        document.querySelector('.pub-search').appendChild(container);
    }

    if (suggestions.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.innerHTML = suggestions.map(p => `
        <div class="suggestion-item" onclick="showProductDetail(${p.id}); document.getElementById('searchSuggestions').style.display='none';">
            <img src="${getProductImage(p)}" alt="${p.name}">
            <div>
                <div>${p.name}</div>
                <div style="color: #FCA311; font-weight: 600;">$${p.price}</div>
            </div>
        </div>
    `).join('');
    container.style.display = 'block';
}

// ===== LOADING ANIMATIONS =====
function showLoading() {
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.remove();
}

function showProductSkeleton() {
    const grid = document.getElementById('publicProductGrid');
    if (!grid) return;

    grid.innerHTML = Array(8).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-text"></div>
            <div class="skeleton-text short"></div>
        </div>
    `).join('');
}

// ===== CART ANIMATION =====
function animateAddToCart(button) {
    button.classList.add('cart-bounce');
    setTimeout(() => button.classList.remove('cart-bounce'), 600);
}

// ===== PRICE FILTER =====
let priceRange = { min: 0, max: 10000 };

function setupPriceFilter() {
    const container = document.getElementById('priceFilterContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="price-filter">
            <label>Prix: $<span id="minPrice">0</span> - $<span id="maxPrice">10000</span></label>
            <input type="range" id="minPriceRange" min="0" max="10000" value="0" oninput="updatePriceFilter()">
            <input type="range" id="maxPriceRange" min="0" max="10000" value="10000" oninput="updatePriceFilter()">
        </div>
    `;
}

function updatePriceFilter() {
    priceRange.min = parseInt(document.getElementById('minPriceRange').value);
    priceRange.max = parseInt(document.getElementById('maxPriceRange').value);
    document.getElementById('minPrice').textContent = priceRange.min;
    document.getElementById('maxPrice').textContent = priceRange.max;
    displayPublicProducts();
}

function filterByPrice(products) {
    return products.filter(p => p.price >= priceRange.min && p.price <= priceRange.max);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    setupSearchAutocomplete();
    setupAdvancedFilters();
    initDarkMode();
    updateCompareBar();

    // Load saved filters
    const savedFilters = localStorage.getItem('takemore_filters');
    if (savedFilters) {
        currentFilters = JSON.parse(savedFilters);
    }

    // Show recently viewed after products load
    setTimeout(() => {
        displayRecentlyViewed();
        const section = document.getElementById('recentlyViewedSection');
        if (section && recentlyViewed.length > 0) {
            section.style.display = 'block';
        }
    }, 1000);
});
