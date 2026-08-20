import sqlite3
import bcrypt
import os
import getpass
import re

# Chemin vers la base de données
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'shop.db')

def validate_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def hash_password(password):
    """Hashe un mot de passe avec bcrypt (cost=12)"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_admin():
    print("=== CRÉATION D'UN COMPTE ADMINISTRATEUR ===")
    
    if not os.path.exists(DB_PATH):
        print(f"❌ La base de données '{DB_PATH}' n'existe pas encore.")
        print("Veuillez d'abord lancer l'application (app.py) pour initialiser la base de données.")
        return

    # Demander l'email
    email = input("Email de l'administrateur [admin@shop.com] : ").strip()
    if not email:
        email = "admin@shop.com"
        
    if not validate_email(email):
        print("❌ Format d'email invalide.")
        return

    # Demander le nom
    name = input("Nom complet de l'administrateur [Admin] : ").strip()
    if not name:
        name = "Admin"

    # Saisie du mot de passe de manière sécurisée (invisible dans la console)
    while True:
        password = getpass.getpass("Mot de passe : ")
        if len(password) < 8:
            print("❌ Le mot de passe doit faire au moins 8 caractères pour être sécurisé.")
            continue
            
        confirm_password = getpass.getpass("Confirmer le mot de passe : ")
        if password != confirm_password:
            print("❌ Les mots de passe ne correspondent pas. Réessayez.")
            continue
        break

    print("\nHachage du mot de passe en cours avec Bcrypt...")
    hashed_password = hash_password(password)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    try:
        # Vérifier si cet email existe déjà
        user = c.execute('SELECT id, role FROM users WHERE email = ?', (email,)).fetchone()
        
        if user:
            # L'utilisateur existe déjà
            user_id, current_role = user
            print(f"⚠️ Un utilisateur avec l'email '{email}' existe déjà.")
            reponse = input("Voulez-vous mettre à jour son rôle en 'admin' et remplacer son mot de passe ? (o/n) : ")
            if reponse.lower() == 'o':
                c.execute('UPDATE users SET password = ?, role = "admin", name = ? WHERE id = ?', 
                          (hashed_password, name, user_id))
                conn.commit()
                print("✅ Compte mis à jour avec succès. L'utilisateur est désormais administrateur.")
            else:
                print("Opération annulée.")
        else:
            # Créer un nouvel administrateur
            c.execute('INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)', 
                      (email, hashed_password, 'admin', name))
            conn.commit()
            print(f"✅ Compte administrateur '{email}' créé avec succès !")

    except sqlite3.Error as e:
        print(f"❌ Erreur de base de données : {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    create_admin()
