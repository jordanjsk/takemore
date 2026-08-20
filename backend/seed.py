import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shop.db')

def seed_data():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Create dummy users
    users = [
        ('jordan@gmail.com', 'pass', 'user', 'Jordan'),
        ('alice@example.com', 'pass', 'user', 'Alice'),
    ]
    for u in users:
        c.execute('INSERT OR IGNORE INTO users (email, password, role, name) VALUES (?, ?, ?, ?)', u)

    # Re-fetch users to get IDs
    user_jordan = conn.execute("SELECT id FROM users WHERE email='jordan@gmail.com'").fetchone()[0]
    user_alice = conn.execute("SELECT id FROM users WHERE email='alice@example.com'").fetchone()[0]

    # Create dummy products
    prod1 = conn.execute("SELECT id FROM products WHERE name='Montre Luxe'").fetchone()
    if not prod1:
        c.execute("INSERT INTO products (name, price, category, stock, image) VALUES ('Montre Luxe', 299.99, 'Accessoires', 10, 'watch.jpg')")
        prod1_id = c.lastrowid
    else:
        prod1_id = prod1[0]

    prod2 = conn.execute("SELECT id FROM products WHERE name='Sac en cuir'").fetchone()
    if not prod2:
        c.execute("INSERT INTO products (name, price, category, stock, image) VALUES ('Sac en cuir', 159.50, 'Accessoires', 5, 'bag.jpg')")
        prod2_id = c.lastrowid
    else:
        prod2_id = prod2[0]

    # Create dummy orders & items
    # Order for Jordan
    c.execute("INSERT INTO orders (user_id, total_price, status, created_at) VALUES (?, ?, ?, '2024-03-20')", (user_jordan, 459.49, 'Livrée'))
    order1_id = c.lastrowid
    c.execute("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, 1, 299.99)", (order1_id, prod1_id))
    c.execute("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, 1, 159.50)", (order1_id, prod2_id))

    # Order for Alice
    c.execute("INSERT INTO orders (user_id, total_price, status, created_at) VALUES (?, ?, ?, '2024-03-22')", (user_alice, 299.99, 'En cours'))
    order2_id = c.lastrowid
    c.execute("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, 1, 299.99)", (order2_id, prod1_id))

    conn.commit()
    conn.close()
    print("Dummy data seeded successfully!")

if __name__ == '__main__':
    seed_data()
