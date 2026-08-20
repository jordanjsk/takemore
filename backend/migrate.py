import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shop.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Create order_items table
    c.execute('''CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER,
        product_id INTEGER,
        quantity INTEGER,
        price REAL,
        FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
    )''')

    # Rename orders columns: total -> total_price, date -> created_at
    c.execute('PRAGMA table_info(orders)')
    columns = [row[1] for row in c.fetchall()]
    
    if 'total' in columns:
        print("Migrating orders table...")
        c.execute('''CREATE TABLE orders_new (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            total_price REAL,
            status TEXT,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        )''')
        
        c.execute('''INSERT INTO orders_new (id, user_id, total_price, status, created_at)
                     SELECT id, user_id, total, status, date FROM orders''')
                     
        c.execute('DROP TABLE orders')
        c.execute('ALTER TABLE orders_new RENAME TO orders')
    else:
        print("Orders table already migrated.")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == '__main__':
    migrate()
