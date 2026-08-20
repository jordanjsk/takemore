import sqlite3
import psycopg2
import os

SQLITE_DB = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "shop.db"
)

POSTGRES_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "andy",
    "user": "andy_user",
    "password": "andy_password",
}

TABLES = [
    "users",
    "products",
    "categories",
    "carousel",
    "reviews",
    "orders",
    "order_items",
    "pages",
]


def migrate():
    print("Connexion à SQLite...")
    sqlite_conn = sqlite3.connect(SQLITE_DB)
    sqlite_conn.row_factory = sqlite3.Row

    print("Connexion à PostgreSQL...")
    postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
    postgres_cursor = postgres_conn.cursor()

    try:
        # ---------------------------------------------------------
        # 1. Tables sans dépendances
        # ---------------------------------------------------------
        for table in [
            "users",
            "products",
            "categories",
            "carousel",
            "pages",
        ]:
            print(f"\nMigration de : {table}")

            rows = sqlite_conn.execute(
                f"SELECT * FROM {table}"
            ).fetchall()

            if not rows:
                print("  → aucune donnée")
                continue

            columns = rows[0].keys()
            column_names = ", ".join(columns)
            placeholders = ", ".join(["%s"] * len(columns))

            query = f"""
                INSERT INTO {table} ({column_names})
                VALUES ({placeholders})
                ON CONFLICT DO NOTHING
            """

            for row in rows:
                postgres_cursor.execute(
                    query,
                    tuple(row[column] for column in columns)
                )

            print(f"  → {len(rows)} ligne(s) transférée(s)")

        # ---------------------------------------------------------
        # 2. Reviews
        # ---------------------------------------------------------
        print("\nMigration de : reviews")

        reviews = sqlite_conn.execute(
            "SELECT * FROM reviews"
        ).fetchall()

        if not reviews:
            print("  → aucune donnée")
        else:
            for row in reviews:
                postgres_cursor.execute(
                    """
                    INSERT INTO reviews
                    (id, product_id, user_name, rating, comment, date)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    tuple(row)
                )

            print(f"  → {len(reviews)} ligne(s) transférée(s)")

        # ---------------------------------------------------------
        # 3. Orders
        # ---------------------------------------------------------
        print("\nMigration de : orders")

        orders = sqlite_conn.execute(
            "SELECT * FROM orders ORDER BY id"
        ).fetchall()

        for row in orders:
            postgres_cursor.execute(
                """
                INSERT INTO orders
                (id, user_id, total_price, status, created_at, phone)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                tuple(row)
            )

        print(f"  → {len(orders)} ligne(s) transférée(s)")

        # ---------------------------------------------------------
        # 4. Order items
        # ---------------------------------------------------------
        print("\nMigration de : order_items")

        order_items = sqlite_conn.execute(
            "SELECT * FROM order_items ORDER BY id"
        ).fetchall()

        migrated_items = 0
        skipped_items = 0

        for row in order_items:
            order_id = row["order_id"]
            product_id = row["product_id"]

            # Vérifier que la commande existe
            postgres_cursor.execute(
                "SELECT 1 FROM orders WHERE id = %s",
                (order_id,)
            )

            order_exists = postgres_cursor.fetchone() is not None

            # Vérifier que le produit existe
            postgres_cursor.execute(
                "SELECT 1 FROM products WHERE id = %s",
                (product_id,)
            )

            product_exists = postgres_cursor.fetchone() is not None

            if not order_exists or not product_exists:
                print(
                    f"  → ligne {row['id']} ignorée : "
                    f"order_id={order_id}, "
                    f"product_id={product_id}"
                )
                skipped_items += 1
                continue

            postgres_cursor.execute(
                """
                INSERT INTO order_items
                (id, order_id, product_id, product_name,
                 quantity, price, product_image)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                tuple(row)
            )

            migrated_items += 1

        print(f"  → {migrated_items} ligne(s) transférée(s)")
        print(f"  → {skipped_items} ligne(s) orpheline(s) ignorée(s)")

        # ---------------------------------------------------------
        # 5. Valider toute la migration
        # ---------------------------------------------------------
        postgres_conn.commit()

        print("\n========================================")
        print("Migration terminée avec succès.")
        print("========================================")

    except Exception as error:
        postgres_conn.rollback()

        print("\n========================================")
        print("ERREUR pendant la migration")
        print("========================================")
        print(error)

        raise

    finally:
        postgres_cursor.close()
        postgres_conn.close()
        sqlite_conn.close()


if __name__ == "__main__":
    migrate()