from flask import Flask, jsonify, request, send_from_directory, send_file, session, redirect, url_for
from functools import wraps
from flask_cors import CORS
from flask_wtf.csrf import CSRFProtect, generate_csrf
from datetime import timedelta
from flask_mail import Mail, Message
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import IntegrityError
import hashlib
import bcrypt
import os
from werkzeug.utils import secure_filename
import time
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
import pandas as pd
import io
import logging
from markupsafe import escape

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__, static_folder='../frontend', static_url_path='')

# Configuration de la session et tout 
app.secret_key = os.getenv('SECRET_KEY', 'cle_secrete_super_securisee_pour_production_123')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)

# --- GESTION DES ENVIRONNEMENTS (DEV vs PROD) ---
FLASK_ENV = os.getenv('FLASK_ENV', 'development')
IS_PRODUCTION = (FLASK_ENV == 'production') or (os.getenv('RENDER') == 'true')

if IS_PRODUCTION:
    # Configuration de PRODUCTION
    # Liste des domaines de production autorisés (séparés par des virgules dans le .env)
    raw_origins = os.getenv(
        'ALLOWED_ORIGINS',
        'https://takemore.netlify.app,https://takemore.com,https://www.takemore.com'
    )
    ALLOWED_ORIGINS = [origin.strip() for origin in raw_origins.split(',') if origin.strip()]
    # En production (SameSite=None nécessite obligatoirement HTTPS donc Secure=True)
    app.config['SESSION_COOKIE_SAMESITE'] = 'None'
    app.config['SESSION_COOKIE_SECURE'] = True
else:
    # Configuration de DÉVELOPPEMENT (Local)
    # Autorise Live Server (5500), React/Vue (3000), Flask (5000)
    ALLOWED_ORIGINS = [
        'http://127.0.0.1:5000', 
        'http://localhost:5000', 
        'http://localhost:3000', 
        'http://127.0.0.1:5500',
        'http://127.0.0.1:5501',
        'http://localhost:5500'
    ]
    # En local sans HTTPS, on utilise Lax et Secure=False pour éviter que le navigateur bloque le cookie
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = False

# Indispensable pour Flask-WTF quand le frontend et le backend ne sont pas sur le même port (ex: Live Server)
app.config['WTF_CSRF_TRUSTED_ORIGINS'] = ALLOWED_ORIGINS

# --- CONFIGURATION CORS STRICTE (WHITELIST) ---
# On applique les règles CORS uniquement sur les endpoints qui en ont besoin
CORS(app, resources={
    r"/api/*": {"origins": ALLOWED_ORIGINS},
    r"/admin/*": {"origins": ALLOWED_ORIGINS}
}, supports_credentials=True)

# Protection CSRF
csrf = CSRFProtect(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Configuration PostgreSQL
POSTGRES_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', '5432')),
    'dbname': os.getenv('DB_NAME', 'andy'),
    'user': os.getenv('DB_USER', 'andy_user'),
    'password': os.getenv('DB_PASSWORD', 'andy_password')
}

UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Mail configuration (Replace with real credentials for production)
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME', 'contact@votresite.com')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD', 'votre-mot-de-passe')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER', 'contact@votresite.com')
mail = Mail(app)

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

class PostgreSQLConnection:
    def __init__(self):
        db_url = os.getenv('DATABASE_URL') or os.getenv('INTERNAL_DATABASE_URL')
        if db_url:
            self.conn = psycopg2.connect(
                db_url,
                cursor_factory=RealDictCursor
            )
        else:
            self.conn = psycopg2.connect(
                **POSTGRES_CONFIG,
                cursor_factory=RealDictCursor
            )

    def execute(self, query, params=None):
        cursor = self.conn.cursor()
        cursor.execute(query, params or ())
        return cursor

    def cursor(self):
        return self.conn.cursor()

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()


def get_db():
    return PostgreSQLConnection()
   

def init_db():
    """
    PostgreSQL est initialisé avec schema.sql.
    Les données existantes ont été migrées depuis SQLite.
    Flask ne recrée donc aucune table au démarrage.
    """
    logging.info("Base PostgreSQL utilisée. Initialisation ignorée.")

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

@app.route('/static/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

def validate_email(email):
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

# --- GESTION SÉCURISÉE DES MOTS DE PASSE (BCRYPT) ---
def is_sha256_hash(hashed_password):
    """Détecte si un hash est au format SHA-256 (64 caractères hex)"""
    return len(hashed_password) == 64 and not hashed_password.startswith('$')

def hash_password(password):
    """Hashe un mot de passe avec bcrypt (salt automatique inclus)"""
    # bcrypt.gensalt() utilise un cost factor de 12 par défaut (recommandé)
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password, hashed_password):
    """Vérifie un mot de passe avec fallback pour les anciens hashs SHA-256"""
    if is_sha256_hash(hashed_password):
        # Fallback : l'utilisateur utilise encore un vieux mot de passe
        old_hash = hashlib.sha256(plain_password.encode('utf-8')).hexdigest()
        return old_hash == hashed_password
    else:
        # Vérification standard avec bcrypt
        try:
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        except ValueError:
            return False

# --- DÉCORATEUR POUR PROTÉGER LES ROUTES ADMIN ---
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 1. Vérifier si l'utilisateur est connecté
        if 'user_id' not in session:
            # Si c'est une requête API ou Ajax, on renvoie une erreur JSON
            if request.is_json or request.path.startswith('/api/') or request.path.startswith('/admin/') or request.headers.get('X-Requested-With') == 'XMLHttpRequest' or 'application/json' in request.headers.get('Accept', ''):
                return jsonify({'error': 'Non authentifié. Veuillez vous connecter.'}), 401
            # Sinon, pour les accès directs via navigateur (ex: export excel), on redirige vers l'accueil
            return redirect('/')
            
        # 2. Vérifier si l'utilisateur a le rôle admin
        if session.get('role') != 'admin':
            print(f"Tentative accès refusé: {request.path} - IP: {request.remote_addr}")
            if request.is_json or request.path.startswith('/api/') or request.path.startswith('/admin/') or request.headers.get('X-Requested-With') == 'XMLHttpRequest' or 'application/json' in request.headers.get('Accept', ''):
                return jsonify({'error': 'Accès refusé. Droits administrateur requis.'}), 403
            return redirect('/')
            
        # Si tout est OK, on exécute la fonction de la route
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/csrf-token', methods=['GET'])
def get_csrf_token():
    return jsonify({'csrf_token': generate_csrf()})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400
    if not validate_email(email):
        return jsonify({'error': 'Email invalide'}), 400
    
    conn = get_db()
    # On cherche l'utilisateur uniquement par son email
    user = conn.execute('SELECT * FROM users WHERE email = %s', (email,)).fetchone()
    
    if user and verify_password(password, user['password']):
        # --- MIGRATION PROGRESSIVE ---
        # Si le hash en BDD est un SHA-256, on le met à jour silencieusement vers bcrypt
        if is_sha256_hash(user['password']):
            new_hash = hash_password(password)
            conn.execute('UPDATE users SET password = %s WHERE id = %s', (new_hash, user['id']))
            conn.commit()
            print(f"[{email}] Mot de passe migré de SHA-256 vers Bcrypt.")
            
        # Enregistrer les infos dans la session Flask
        session.permanent = True
        session['user_id'] = user['id']
        session['role'] = user['role']
        
        conn.close()
        return jsonify({'success': True, 'id': user['id'], 'role': user['role'], 'name': user['name']})
        
    conn.close()
    return jsonify({'success': False, 'error': 'Identifiants incorrects'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Déconnecté avec succès'})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email', '').strip()
    password = data.get('password', '')
    name = escape(data.get('name', '').strip())
    
    if not email or not password or not name:
        return jsonify({'error': 'Tous les champs sont requis'}), 400
    if not validate_email(email):
        return jsonify({'error': 'Email invalide'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Le mot de passe doit contenir au moins 6 caractères'}), 400
    
    # Hasher avec bcrypt au lieu de SHA-256
    password_hash = hash_password(password)
    
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute(
            'INSERT INTO users (email, password, role, name) VALUES (%s, %s, %s, %s) RETURNING id', (email, password_hash, 'user', name)
        )
        user_id = c.fetchone()['id']
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': user_id, 'name': name, 'role': 'user'}), 201
    except IntegrityError:
        conn.close()
        return jsonify({'success': False, 'message': 'Email déjà utilisé'}), 400

@app.route('/api/products', methods=['GET'])
def get_products():
    conn = get_db()
    products = conn.execute('SELECT * FROM products').fetchall()
    conn.close()
    return jsonify([dict(p) for p in products])

@app.route('/api/products/<int:id>', methods=['GET'])
def get_product(id):
    conn = get_db()
    product = conn.execute('SELECT * FROM products WHERE id = %s', (id,)).fetchone()
    conn.close()
    return jsonify(dict(product)) if product else ('', 404)

@app.route('/api/products', methods=['POST'])
def create_product():
    data = request.json
    name = escape(data.get('name', '').strip())
    price = data.get('price')
    stock = data.get('stock')
    
    if not name: return jsonify({'error': 'Le nom du produit est requis'}), 400
    
    try:
        price = float(price) if price else 0
        stock = int(stock) if stock else 0
    except (ValueError, TypeError):
        return jsonify({'error': 'Prix et stock doivent être des nombres'}), 400
    
    if price < 0 or stock < 0: return jsonify({'error': 'Prix et stock doivent être positifs'}), 400
    
    description = escape(data.get('description', '').strip())
    category = escape(data.get('category', '').strip())
    image = escape(data.get('image', '').strip())
    
    conn = get_db()
    c = conn.cursor()
    c.execute('INSERT INTO products (name, price, description, category, image, stock, rating) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id',
              (name, price, description, category, image, stock, data.get('rating', 0)))
    product_id = c.fetchone()['id']
    conn.commit()
    conn.close()
    return jsonify({'id': product_id, 'success': True}), 201

@app.route('/api/products/<int:id>', methods=['PUT', 'DELETE'])
def update_or_delete_product(id):
    conn = get_db()
    if request.method == 'DELETE':
        conn.execute('DELETE FROM products WHERE id = %s', (id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    elif request.method == 'PUT':
        data = request.json
        name = escape(data.get('name', '').strip())
        price = data.get('price')
        stock = data.get('stock')
        if not name: return jsonify({'error': 'Le nom du produit est requis'}), 400
        try:
            price = float(price) if price else 0
            stock = int(stock) if stock else 0
        except: return jsonify({'error': 'Prix et stock doivent être des nombres'}), 400
        
        description = escape(data.get('description', '').strip())
        category = escape(data.get('category', '').strip())
        image = escape(data.get('image', '').strip())
        
        conn.execute('UPDATE products SET name=%s, price=%s, description=%s, category=%s, image=%s, stock=%s, rating=%s WHERE id=%s',
                     (name, price, description, category, image, stock, data.get('rating', 0), id))
        conn.commit()
        conn.close()
        return jsonify({'success': True})

@app.route('/api/categories', methods=['GET', 'POST'])
def categories():
    conn = get_db()
    if request.method == 'GET':
        categories = conn.execute('SELECT * FROM categories').fetchall()
        conn.close()
        return jsonify([dict(c) for c in categories])
    elif request.method == 'POST':
        data = request.json
        name = escape(data.get('name', '').strip())
        icon = escape(data.get('icon', '').strip())
        conn.execute('INSERT INTO categories (name, icon) VALUES (%s, %s)', (name, icon))
        conn.commit()
        conn.close()
        return jsonify({'success': True}), 201

@app.route('/api/categories/<int:id>', methods=['DELETE'])
def delete_category(id):
    conn = get_db()
    conn.execute('DELETE FROM categories WHERE id = %s', (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# Legacy api endpoints mapping for backwards compatibility
@app.route('/api/orders', methods=['GET'])
def get_orders_legacy():
    conn = get_db()
    orders = conn.execute('''
        SELECT o.id, o.user_id, o.phone, o.total_price as total, o.status, o.created_at as date, u.name as user_name, u.email as user_email 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.created_at DESC
    ''').fetchall()
    
    orders_list = []
    for o in orders:
        order_dict = dict(o)
        items = conn.execute('''
            SELECT oi.quantity as qty, oi.price, p.name, p.image 
            FROM order_items oi 
            LEFT JOIN products p ON oi.product_id = p.id 
            WHERE oi.order_id = %s
        ''', (o['id'],)).fetchall()
        order_dict['items'] = [dict(i) for i in items]
        orders_list.append(order_dict)
    conn.close()
    return jsonify(orders_list)

@app.route('/api/orders', methods=['POST'])
def create_order_legacy():
    data = request.json
    try:
        user_id = int(data.get('user_id', 1))
    except (ValueError, TypeError):
        user_id = 1
        
    if user_id == 1:
        return jsonify({'error': 'L\'administrateur système ne peut pas passer de commande.'}), 403
        
    if 'items' not in data or not isinstance(data['items'], list) or len(data['items']) == 0:
        return jsonify({'error': 'La commande doit contenir au moins un produit.'}), 400

    conn = get_db()
    c = conn.cursor()
    
    total_calculated = 0.0
    valid_items = []
    
    for item in data['items']:
        product_id = item.get('product_id') or item.get('id')
        try:
            quantity = int(item.get('quantity') or item.get('qty', 1))
        except (ValueError, TypeError):
            conn.close()
            logging.warning(f"Commande rejetée: quantité invalide pour le produit {product_id}")
            return jsonify({'error': 'Quantité invalide.'}), 400
            
        if quantity <= 0:
            conn.close()
            logging.warning(f"Commande rejetée: tentative d'achat avec quantité négative ({quantity})")
            return jsonify({'error': 'La quantité doit être supérieure à 0.'}), 400
            
        product = conn.execute('SELECT id, price FROM products WHERE id = %s', (product_id,)).fetchone()
        if not product:
            conn.close()
            logging.warning(f"Commande rejetée: tentative d'achat d'un produit inexistant ({product_id})")
            return jsonify({'error': f"Le produit {product_id} n'existe pas."}), 400
            
        product_price = float(product['price'])
        total_calculated += product_price * quantity
        
        valid_items.append({
            'product_id': product_id,
            'quantity': quantity,
            'price': product_price
        })

    phone = escape(data.get('phone', '').strip())
    status = escape(data.get('status', 'En attente').strip())
    
    order_id = conn.execute('INSERT INTO orders (user_id, phone, total_price, status, created_at) VALUES (%s, %s, %s, %s, %s) RETURNING id',
              (user_id, phone, total_calculated, status, time.strftime("%Y-%m-%d"))
    ).fetchone()['id']
    
    for item in valid_items:
        c.execute('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (%s, %s, %s, %s)',
                  (order_id, item['product_id'], item['quantity'], item['price']))
                  
    conn.commit()
    conn.close()
    
    logging.info(f"Commande #{order_id} sécurisée créée. Total vérifié: {total_calculated}$")
    return jsonify({'id': order_id, 'success': True, 'total_paye': total_calculated}), 201

@app.route('/api/orders/<int:id>', methods=['PUT', 'DELETE'])
def modify_order_legacy(id):
    conn = get_db()
    if request.method == 'DELETE':
        conn.execute('DELETE FROM orders WHERE id = %s', (id,))
    else:
        data = request.json
        if 'status' in data:
            conn.execute('UPDATE orders SET status = %s WHERE id = %s', (data['status'], id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# --- NEW ADMIN ROUTES ---

@app.route('/admin/orders', methods=['GET'])
@admin_required
def admin_get_orders():
    conn = get_db()
    orders = conn.execute('''
        SELECT o.id, o.user_id, o.phone, o.total_price, o.status, o.created_at, u.name as user_name, u.email as user_email 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.created_at DESC
    ''').fetchall()
    
    orders_list = []
    for o in orders:
        order_dict = dict(o)
        order_dict['user'] = {
            'name': o['user_name'] or f"{o['user_email'] if o['user_email'] else 'Client #' + str(order_dict['user_id'])}",
            'email': o['user_email'] or "N/A",
            'phone': o['phone'] or "N/A"
        }
        
        items = conn.execute('''
            SELECT oi.quantity, oi.price, p.name, p.image as image_url 
            FROM order_items oi 
            JOIN products p ON oi.product_id = p.id 
            WHERE oi.order_id = %s
        ''', (o['id'],)).fetchall()
        order_dict['items'] = [dict(i) for i in items]
        orders_list.append(order_dict)
        
    conn.close()
    return jsonify(orders_list)

@app.route('/admin/orders/<int:id>', methods=['GET'])
@admin_required
def admin_get_order(id):
    conn = get_db()
    order = conn.execute('''
        SELECT o.id, o.user_id, o.phone, o.total_price, o.status, o.created_at, u.name as user_name, u.email as user_email 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        WHERE o.id = %s
    ''', (id,)).fetchone()
    
    if not order:
        return jsonify({'error': 'Commande introuvable'}), 404
        
    order_dict = dict(order)
    order_dict['user'] = {
        'name': order['user_name'] or f"{order['user_email'] if order['user_email'] else 'Client #' + str(order_dict['user_id'])}",
        'email': order['user_email'] or "N/A",
        'phone': order['phone'] or "N/A"
    }
    
    items = conn.execute('''
        SELECT oi.product_id, oi.quantity, oi.price, p.name, p.image as image_url 
        FROM order_items oi 
        JOIN products p ON oi.product_id = p.id 
        WHERE oi.order_id = %s
    ''', (id,)).fetchall()
    
    order_dict['items'] = [dict(i) for i in items]
    conn.close()
    return jsonify(order_dict)

@app.route('/admin/orders/<int:id>/status', methods=['PUT'])
@admin_required
def admin_update_order_status(id):
    data = request.json
    new_status = data.get('status')
    
    if not new_status:
        return jsonify({'error': 'Status requisition'}), 400
        
    conn = get_db()
    conn.execute('UPDATE orders SET status = %s WHERE id = %s', (new_status, id))
    conn.commit()
    
    if new_status.lower() in ['livrée', 'livree', 'livree']:
        order_info = conn.execute('''
            SELECT o.id, o.total_price, u.name, u.email 
            FROM orders o 
            JOIN users u ON o.user_id = u.id 
            WHERE o.id = %s
        ''', (id,)).fetchone()
        
        if order_info and order_info['email']:
            try:
                # Generate PDF
                pdf_buffer = generate_invoice_pdf(id, conn)
                pdf_buffer.seek(0)
                
                # Send Email
                msg = Message(
                    subject=f"Votre commande #{order_info['id']} est livrée",
                    recipients=[order_info['email']],
                    body=f"Bonjour {order_info['name']},\n\nMerci d'avoir commandé sur Takemore.\nVotre commande #{order_info['id']} a été livrée avec succès.\nMontant total : {order_info['total_price']} $.\n\nVeuillez trouver votre facture en pièce jointe.\n\nCordialement,\nL'équipe Takemore"
                )
                msg.attach(f"facture_{order_info['id']}.pdf", "application/pdf", pdf_buffer.read())
                mail.send(msg)
            except Exception as e:
                print(f"Failed to send email: {e}")
                
    conn.close()
    return jsonify({'success': True, 'status': new_status})

@app.route('/admin/orders/export/excel', methods=['GET'])
@admin_required
def admin_export_excel():
    conn = get_db()
    orders = conn.execute('''
        SELECT o.id, u.name as client, u.email, (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as total_products, o.total_price, o.status, o.created_at
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
    ''').fetchall()
    conn.close()

    data = [dict(o) for o in orders]
    df = pd.DataFrame(data)
    
    if not df.empty:
        df.columns = ['ID Commande', 'Client', 'Email', 'Nb Produits', 'Total ($)', 'Statut', 'Date']

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Commandes')
    output.seek(0)
    
    return send_file(output, as_attachment=True, download_name="commandes_export.xlsx", mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

def generate_invoice_pdf(order_id, conn):
    order = conn.execute('''
        SELECT o.id, o.total_price, o.created_at, u.name, u.email 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        WHERE o.id = %s
    ''', (order_id,)).fetchone()
    
    items = conn.execute('''
        SELECT p.name, oi.quantity, oi.price, (oi.quantity * oi.price) as total_line
        FROM order_items oi 
        JOIN products p ON oi.product_id = p.id 
        WHERE oi.order_id = %s
    ''', (order_id,)).fetchall()
    
    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(pdf_buffer, pagesize=letter)
    elements = []
    
    styles = getSampleStyleSheet()
    
    elements.append(Paragraph("<b><font size=18>Takemore - Facture</font></b>", styles['Title']))
    elements.append(Spacer(1, 20))
    
    elements.append(Paragraph(f"<b>Commande ID:</b> {order['id']}", styles['Normal']))
    elements.append(Paragraph(f"<b>Date:</b> {order['created_at']}", styles['Normal']))
    elements.append(Spacer(1, 10))
    
    elements.append(Paragraph(f"<b>Client:</b> {order['name'] or 'N/A'}", styles['Normal']))
    elements.append(Paragraph(f"<b>Email:</b> {order['email'] or 'N/A'}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    data = [["Produit", "Quantité", "Prix Unitaire ($)", "Total ($)"]]
    for item in items:
        data.append([item["name"], str(item["quantity"]), f"{item['price']:.2f}", f"{item['total_line']:.2f}"])
        
    t = Table(data, style=[
        ('BACKGROUND', (0,0), (-1,0), colors.grey),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,0), 12),
        ('BACKGROUND', (0,1), (-1,-1), colors.beige),
        ('GRID', (0,0), (-1,-1), 1, colors.black)
    ])
    
    elements.append(t)
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(f"<b>Montant Total:</b> {order['total_price']:.2f} $", styles['Heading3']))
    
    doc.build(elements)
    
    return pdf_buffer

@app.route('/admin/orders/<int:id>/invoice', methods=['GET'])
@admin_required
def admin_generate_invoice_route(id):
    conn = get_db()
    pdf_buffer = generate_invoice_pdf(id, conn)
    conn.close()
    pdf_buffer.seek(0)
    
    return send_file(pdf_buffer, as_attachment=True, download_name=f"facture_{id}.pdf", mimetype="application/pdf")

# Other API endpoints (Carousel, Stats, Uploads, Users) remain the same
@app.route('/api/carousel', methods=['GET', 'POST'])
def carousel():
    conn = get_db()
    if request.method == 'GET':
        slides = conn.execute('SELECT * FROM carousel ORDER BY position').fetchall()
        conn.close()
        return jsonify([dict(s) for s in slides])
    elif request.method == 'POST':
        data = request.json
        title = escape(data.get('title', '').strip())
        text = escape(data.get('text', '').strip())
        image = escape(data.get('image', '').strip())
        position = data.get('position', 0)
        conn.execute('INSERT INTO carousel (title, text, image, position) VALUES (%s, %s, %s, %s)',
                  (title, text, image, position))
        conn.commit()
        conn.close()
        return jsonify({'success': True}), 201

@app.route('/api/carousel/<int:id>', methods=['DELETE'])
def delete_carousel(id):
    conn = get_db()
    conn.execute('DELETE FROM carousel WHERE id = %s', (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/reviews/<int:product_id>', methods=['GET'])
def get_reviews(product_id):
    conn = get_db()
    reviews = conn.execute('SELECT * FROM reviews WHERE product_id = %s ORDER BY date DESC', (product_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in reviews])

@app.route('/api/pages', methods=['GET'])
def get_pages():
    conn = get_db()
    pages = conn.execute('SELECT * FROM pages').fetchall()
    conn.close()
    return jsonify([dict(p) for p in pages])

@app.route('/api/pages/<slug>', methods=['GET'])
def get_page(slug):
    conn = get_db()
    page = conn.execute('SELECT * FROM pages WHERE slug = %s', (slug,)).fetchone()
    conn.close()
    if page:
        return jsonify(dict(page))
    return jsonify({'error': 'Page not found'}), 404

@app.route('/api/pages/<slug>', methods=['PUT'])
@admin_required
def update_page(slug):
    data = request.json
    content = data.get('content', '')  # Not escaped because we want to save HTML
    title = data.get('title', '')
    
    conn = get_db()
    conn.execute('UPDATE pages SET title = %s, content = %s WHERE slug = %s', (title, content, slug))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files: return jsonify({'error': 'No file'}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({'error': 'No file selected'}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        timestamp = str(int(time.time() * 1000))
        name, ext = os.path.splitext(filename)
        filename = f"{name}_{timestamp}{ext}"
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        return jsonify({'success': True, 'filename': filename})
    return jsonify({'error': 'Invalid file type'}), 400

# Cache mémoire simple pour les statistiques (évite de spammer la base de données)
stats_cache = {
    'data': None,
    'last_updated': 0
}
STATS_CACHE_TTL = 60  # Durée de vie du cache en secondes (1 minute)

@app.route('/api/stats', methods=['GET'])
@admin_required
def get_stats():
    global stats_cache
    import time
    current_time = time.time()
    
    # Si le cache est valide, on le retourne directement
    if stats_cache['data'] and (current_time - stats_cache['last_updated'] < STATS_CACHE_TTL):
        return jsonify(stats_cache['data'])
        
    conn = get_db()
    # Calcul des statistiques (Opération coûteuse)
    orders = conn.execute('SELECT SUM(total_price) as revenue, COUNT(*) as count FROM orders').fetchone()
    products = conn.execute('SELECT COUNT(*) as count FROM products').fetchone()
    users = conn.execute('SELECT COUNT(*) as count FROM users').fetchone()
    conn.close()
    
    # Sécurisation des valeurs retournées (uniquement le nécessaire)
    stats_data = {
        'revenue': round(orders['revenue'] or 0, 2),
        'orders': orders['count'] or 0,
        'products': products['count'] or 0,
        'users': users['count'] or 0
    }
    
    # Mise à jour du cache
    stats_cache['data'] = stats_data
    stats_cache['last_updated'] = current_time
    
    return jsonify(stats_data)

@app.route('/api/user/stats', methods=['GET'])
def get_user_stats():
    """Route alternative pour les utilisateurs classiques : renvoie uniquement LEURS statistiques"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Non authentifié. Veuillez vous connecter.'}), 401
        
    conn = get_db()
    # On filtre strictement avec le user_id de la session
    user_orders = conn.execute('SELECT COUNT(*) as count, SUM(total_price) as total_spent FROM orders WHERE user_id = %s', (user_id,)).fetchone()
    conn.close()
    
    return jsonify({
        'orders_count': user_orders['count'] or 0,
        'total_spent': round(user_orders['total_spent'] or 0, 2)
    })

@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    # Récupération des paramètres de filtrage (Bonus)
    role_filter = request.args.get('role', '').strip()
    search_query = request.args.get('search', '').strip()
    
    query = 'SELECT id, email, name, role FROM users WHERE 1=1'
    params = []
    
    if role_filter:
        query += ' AND role = %s'
        params.append(role_filter)
        
    if search_query:
        query += ' AND (name LIKE %s OR email LIKE %s)'
        search_term = f'%{search_query}%'
        params.extend([search_term, search_term])
        
    query += ' ORDER BY id DESC'
    
    conn = get_db()
    users = conn.execute(query, params).fetchall()
    conn.close()
    
    # Filtrage strict en Python pour s'assurer de ne JAMAIS envoyer de données sensibles
    safe_users = []
    for u in users:
        safe_users.append({
            'id': u['id'],
            'email': u['email'],
            'name': u['name'],
            'role': u['role']
        })
        
    return jsonify(safe_users)

# Initialisation de la base de données au démarrage (indispensable sous Gunicorn)
init_db()

if __name__ == '__main__':
    app.run(debug=True, port=5000)

