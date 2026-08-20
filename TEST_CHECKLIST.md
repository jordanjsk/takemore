# ✅ Checklist des fonctionnalités à tester

## Backend
- [ ] Démarrer le serveur: `python backend/app.py`
- [ ] Vérifier que la table `reviews` est créée
- [ ] Tester l'endpoint `/api/reviews/:product_id`
- [ ] Tester l'endpoint `POST /api/reviews`

## Frontend - Pagination
- [ ] Ouvrir le site public
- [ ] Vérifier que les produits sont paginés (12 par défaut)
- [ ] Changer le nombre de produits par page (12/24/48)
- [ ] Naviguer entre les pages avec les boutons
- [ ] Vérifier que la préférence est sauvegardée (recharger la page)

## Frontend - Wishlist
- [ ] Cliquer sur le cœur d'un produit
- [ ] Vérifier que le cœur devient rouge
- [ ] Recharger la page et vérifier que le favori est toujours là
- [ ] Retirer un produit des favoris

## Frontend - Avis
- [ ] Ouvrir un produit (modal de détail)
- [ ] Aller dans l'onglet "Avis"
- [ ] Cliquer sur "Laisser un avis"
- [ ] Sélectionner des étoiles (1-5)
- [ ] Écrire un commentaire
- [ ] Soumettre l'avis
- [ ] Vérifier que l'avis apparaît dans la liste

## Frontend - Historique
- [ ] Consulter plusieurs produits
- [ ] Vérifier que la section "Récemment consultés" apparaît
- [ ] Recharger la page et vérifier que l'historique persiste
- [ ] Cliquer sur un produit de l'historique

## Frontend - Recherche
- [ ] Taper au moins 2 caractères dans la barre de recherche
- [ ] Vérifier que les suggestions apparaissent
- [ ] Cliquer sur une suggestion
- [ ] Vérifier que le modal du produit s'ouvre

## Frontend - Animations
- [ ] Ajouter un produit au panier
- [ ] Vérifier l'animation "bounce" du bouton
- [ ] Ouvrir un modal
- [ ] Vérifier l'animation de fade in + slide up
- [ ] Recharger la page
- [ ] Vérifier les skeletons de chargement (si implémentés)

## Frontend - Modal produit
- [ ] Cliquer sur un produit
- [ ] Vérifier le layout 2 colonnes
- [ ] Tester les 3 onglets (Description, Spécifications, Avis)
- [ ] Ajouter au panier depuis le modal
- [ ] Fermer le modal

## Tests de persistance
- [ ] Ajouter des produits au panier
- [ ] Ajouter des favoris
- [ ] Consulter des produits
- [ ] Fermer le navigateur
- [ ] Rouvrir et vérifier que tout est sauvegardé

## Tests admin
- [ ] Se connecter en tant qu'admin
- [ ] Ajouter un produit avec image
- [ ] Vérifier que le produit apparaît sur le site public
- [ ] Consulter les avis des produits (si accessible en admin)

## Bugs potentiels à vérifier
- [ ] Pagination avec filtres de recherche
- [ ] Wishlist avec produits supprimés
- [ ] Avis sans connexion utilisateur
- [ ] Historique avec plus de 10 produits
- [ ] Suggestions de recherche avec caractères spéciaux

## Performance
- [ ] Tester avec 50+ produits
- [ ] Vérifier la vitesse de pagination
- [ ] Vérifier la vitesse de recherche
- [ ] Vérifier le chargement des avis

## Responsive (si implémenté)
- [ ] Tester sur mobile
- [ ] Tester sur tablette
- [ ] Vérifier que les modals sont adaptés
- [ ] Vérifier la pagination sur petit écran
