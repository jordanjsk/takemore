# Takemore - Marketplace E-commerce

## Installation

### Avec Docker Compose (Recommandé)

1. S'assurer d'avoir **Docker** et **Docker Compose** installés.
2. Copier le fichier `.env.example` en `.env` (déjà créé pour vous).
3. Lancer l'application avec la commande :
   ```bash
   docker compose up -d --build
   ```
   L'application est accessible à l'adresse suivante : [http://localhost:8080](http://localhost:8080)
4. Pour voir les logs en direct :
   ```bash
   docker compose logs -f
   ```
5. Pour arrêter le conteneur :
   ```bash
   docker compose down
   ```

### Sans Docker (Installation classique)

#### Backend (Python)

1. Installer les dépendances :
```bash
cd backend
pip install -r requirements.txt
```

2. Démarrer le serveur :
```bash
python app.py
```

Le serveur démarre sur http://localhost:5000

#### Frontend

Ouvrir `index.html` dans un navigateur ou via Live Server.

## Connexion Admin

- Email: admin@shop.com
- Mot de passe: admin123

## API Endpoints

- GET /api/products - Liste des produits
- POST /api/products - Créer un produit
- PUT /api/products/:id - Modifier un produit
- DELETE /api/products/:id - Supprimer un produit
- GET /api/categories - Liste des catégories
- GET /api/orders - Liste des commandes
- GET /api/stats - Statistiques
- POST /api/login - Authentification
