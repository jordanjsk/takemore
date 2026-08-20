import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend', 'shop.db')

def migrate():
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('ALTER TABLE orders ADD COLUMN phone TEXT')
        conn.commit()
        conn.close()
        print("Migrated successfully")
    except Exception as e:
        print("Migration info:", e)

if __name__ == '__main__':
    migrate()
