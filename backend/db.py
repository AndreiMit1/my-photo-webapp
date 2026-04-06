import sqlite3
import time
import json
import re
from rapidfuzz import process, fuzz
import pymorphy3
import secrets
import string

DB_PATH = "results.db"

MORPH = pymorphy3.MorphAnalyzer()

RU_STOPWORDS = {
    "факультет", "фак", "ф-т", "школа", "институт", "университет", "академия", "колледж",
    "кафедра", "департамент", "отделение", "программа", "направление",
    "им", "имени", "г", "город", "филиал", "в", "на", "по", "и", "the", "of"
}


def generate_participant_id() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "P-" + "".join(secrets.choice(alphabet) for _ in range(8))


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        cursor = db.cursor()

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
          user_id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at INTEGER NOT NULL,

          participant_id TEXT UNIQUE,

          full_name TEXT,

          org_raw TEXT,
          org_norm TEXT,
          org_cluster_id INTEGER,

          faculty_raw TEXT,
          faculty_norm TEXT,
          faculty_cluster_id INTEGER,

          degree TEXT,
          course TEXT,

          gpa_quantile TEXT,
          gpa_mathstat TEXT,
          gpa_econometrics TEXT,
          gpa_ml TEXT,

          wants_raffle INTEGER NOT NULL DEFAULT 0,
          wants_leaderboard INTEGER NOT NULL DEFAULT 0,

          email TEXT,
          verified_at INTEGER
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            email TEXT,
            created_at INTEGER NOT NULL,
            phi REAL,
            total_score INTEGER,
            avg_score INTEGER,
            payload_json TEXT NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS org_clusters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canon_text TEXT NOT NULL,
            sample_raw TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS faculty_clusters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canon_text TEXT NOT NULL,
            sample_raw TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS reward_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            amount_rub INTEGER NOT NULL,
            full_name TEXT NOT NULL,
            bank_name TEXT NOT NULL,
            payout_phone TEXT NOT NULL,
            consent_personal_data INTEGER NOT NULL
        )
        """)

        db.commit()


def clean_ru(s: str) -> str:
    s = (s or "").strip().lower().replace("ё", "е")
    s = re.sub(r"[\(\)\[\]\{\},;:!?\.\-_/\\]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def lemmatize_ru(s: str) -> str:
    s = clean_ru(s)
    if not s:
        return ""
    tokens = []
    for w in s.split():
        if len(w) <= 1:
            continue
        p = MORPH.parse(w)[0]
        lemma = p.normal_form
        if lemma in RU_STOPWORDS:
            continue
        tokens.append(lemma)
    return " ".join(tokens)


def get_or_create_org_cluster(org_raw: str, threshold: int = 88) -> tuple[int, str]:
    org_norm = lemmatize_ru(org_raw)
    if not org_norm:
        org_norm = "unknown"

    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("SELECT id, canon_text FROM org_clusters")
        rows = cur.fetchall()

        if rows:
            choices = [r[1] for r in rows]
            id_by_text = {r[1]: r[0] for r in rows}
            best = process.extractOne(org_norm, choices, scorer=fuzz.token_set_ratio)
            if best and best[1] >= threshold:
                return id_by_text[best[0]], org_norm

        now = int(time.time())
        cur.execute(
            "INSERT INTO org_clusters (canon_text, sample_raw, created_at) VALUES (?, ?, ?)",
            (org_norm, org_raw[:300], now),
        )
        db.commit()
        return cur.lastrowid, org_norm


def get_or_create_faculty_cluster(faculty_raw: str, threshold: int = 88) -> tuple[int, str]:
    faculty_norm = lemmatize_ru(faculty_raw)
    if not faculty_norm:
        faculty_norm = "unknown"

    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("SELECT id, canon_text FROM faculty_clusters")
        rows = cur.fetchall()

        if rows:
            choices = [r[1] for r in rows]
            id_by_text = {r[1]: r[0] for r in rows}
            best = process.extractOne(faculty_norm, choices, scorer=fuzz.token_set_ratio)
            if best and best[1] >= threshold:
                return id_by_text[best[0]], faculty_norm

        now = int(time.time())
        cur.execute(
            "INSERT INTO faculty_clusters (canon_text, sample_raw, created_at) VALUES (?, ?, ?)",
            (faculty_norm, faculty_raw[:300], now),
        )
        db.commit()
        return cur.lastrowid, faculty_norm


def participant_id_exists(pid: str) -> bool:
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("SELECT 1 FROM users WHERE participant_id=?", (pid,))
        return cur.fetchone() is not None


def make_unique_participant_id() -> str:
    while True:
        pid = generate_participant_id()
        if not participant_id_exists(pid):
            return pid


def upsert_user_profile(data: dict) -> tuple[int, str | None]:
    now = int(time.time())

    org_cluster_id, org_norm = get_or_create_org_cluster(data["org_raw"])
    faculty_cluster_id, faculty_norm = get_or_create_faculty_cluster(data["faculty_raw"])

    wants_raffle = int(data.get("wants_raffle", 0))
    participant_id = make_unique_participant_id() if wants_raffle else None

    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("""
            INSERT INTO users (
              created_at,
              participant_id,
              full_name,
              org_raw, org_norm, org_cluster_id,
              faculty_raw, faculty_norm, faculty_cluster_id,
              degree, course,
              gpa_quantile, gpa_mathstat, gpa_econometrics, gpa_ml,
              wants_raffle, wants_leaderboard,
              email, verified_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            now,
            participant_id,
            data.get("full_name"),
            data.get("org_raw"),
            org_norm,
            org_cluster_id,
            data.get("faculty_raw"),
            faculty_norm,
            faculty_cluster_id,
            data.get("degree"),
            data.get("course"),
            data.get("gpa_quantile"),
            data.get("gpa_mathstat"),
            data.get("gpa_econometrics"),
            data.get("gpa_ml"),
            wants_raffle,
            int(data.get("wants_leaderboard", 0)),
            data.get("email"),
            data.get("verified_at"),
        ))
        db.commit()
        return cur.lastrowid, participant_id


def attach_email_to_user(user_id: int, email: str):
    now = int(time.time())
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("""
            UPDATE users
            SET email=?, verified_at=?
            WHERE user_id=?
        """, (email, now, user_id))
        db.commit()


def get_user_email(user_id: int) -> str | None:
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("SELECT email FROM users WHERE user_id=?", (user_id,))
        row = cur.fetchone()
        return row[0] if row else None


def save_results(user_id: int, payload: dict):
    email = get_user_email(user_id)

    phi = payload.get("phi")
    total_score = payload.get("totalScore")
    avg_score = payload.get("avgScore")

    with sqlite3.connect(DB_PATH) as db:
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO submissions (user_id, email, created_at, phi, total_score, avg_score, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            email,
            int(time.time()),
            float(phi) if phi is not None else None,
            int(total_score) if total_score is not None else None,
            int(avg_score) if avg_score is not None else None,
            json.dumps(payload, ensure_ascii=False),
        ))
        db.commit()


def save_reward_request(data: dict):
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("""
            INSERT INTO reward_requests (
                user_id,
                created_at,
                amount_rub,
                full_name,
                bank_name,
                payout_phone,
                consent_personal_data
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            data["user_id"],
            int(time.time()),
            data["amount_rub"],
            data["full_name"],
            data["bank_name"],
            data["payout_phone"],
            int(data["consent_personal_data"]),
        ))
        db.commit()


def get_leaderboard(limit: int = 50, org_cluster_id: int | None = None, faculty_cluster_id: int | None = None):
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cur = db.cursor()

        filters = ["u.wants_leaderboard = 1", "u.participant_id IS NOT NULL"]
        params: list = []

        if org_cluster_id is not None:
            filters.append("u.org_cluster_id = ?")
            params.append(org_cluster_id)

        if faculty_cluster_id is not None:
            filters.append("u.faculty_cluster_id = ?")
            params.append(faculty_cluster_id)

        where_sql = " AND ".join(filters)

        # 1. сырые данные по участникам
        cur.execute(f"""
            SELECT
                u.user_id,
                u.participant_id,
                u.org_raw,
                u.faculty_raw,
                AVG(s.total_score) AS mean_score,
                COUNT(s.id) AS n_runs
            FROM users u
            JOIN submissions s ON s.user_id = u.user_id
            WHERE {where_sql}
            GROUP BY u.user_id, u.participant_id, u.org_raw, u.faculty_raw
        """, params)

        rows = [dict(r) for r in cur.fetchall()]

        if not rows:
            return []

        # 2. общее среднее
        mu = sum(r["mean_score"] for r in rows) / len(rows)

        # 3. межучастниковая дисперсия tau^2
        if len(rows) > 1:
            tau2 = sum((r["mean_score"] - mu) ** 2 for r in rows) / (len(rows) - 1)
        else:
            tau2 = 0.0

        # 4. внутриучастниковая дисперсия sigma^2
        # считаем pooled variance по всем наблюдениям
        cur.execute(f"""
            SELECT
                u.user_id,
                s.total_score
            FROM users u
            JOIN submissions s ON s.user_id = u.user_id
            WHERE {where_sql}
        """, params)

        raw_scores = cur.fetchall()

        by_user: dict[int, list[float]] = {}
        for row in raw_scores:
            by_user.setdefault(row["user_id"], []).append(float(row["total_score"]))

        numerator = 0.0
        denominator = 0

        for user_id, vals in by_user.items():
            if len(vals) <= 1:
                continue
            mean_val = sum(vals) / len(vals)
            numerator += sum((v - mean_val) ** 2 for v in vals)
            denominator += len(vals) - 1

        sigma2 = numerator / denominator if denominator > 0 else 0.0

        # 5. коэффициент сжатия
        if tau2 <= 1e-12:
            lambda_ = 0.0
        else:
            lambda_ = sigma2 / tau2

        # 6. байесовская оценка
        items = []
        for r in rows:
            n_i = r["n_runs"]
            ybar_i = r["mean_score"]

            if lambda_ <= 1e-12:
                bayes_score = ybar_i
            else:
                bayes_score = (n_i / (n_i + lambda_)) * ybar_i + (lambda_ / (n_i + lambda_)) * mu

            items.append({
                "user_id": r["user_id"],
                "participant_id": r["participant_id"],
                "org_raw": r["org_raw"],
                "faculty_raw": r["faculty_raw"],
                "mean_score": round(ybar_i, 2),
                "bayes_score": round(bayes_score, 2),
                "n_runs": n_i,
            })

        items.sort(key=lambda x: (-x["bayes_score"], -x["mean_score"], -x["n_runs"]))

        for i, item in enumerate(items[:limit], start=1):
            item["rank"] = i

        return items[:limit]
    
def get_university_groups():
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cur = db.cursor()
        cur.execute("""
            SELECT
                org_cluster_id AS id,
                MIN(org_raw) AS label,
                COUNT(*) AS users_count
            FROM users
            WHERE wants_leaderboard = 1
              AND participant_id IS NOT NULL
              AND org_cluster_id IS NOT NULL
            GROUP BY org_cluster_id
            ORDER BY label
        """)
        return [dict(row) for row in cur.fetchall()]


def get_faculty_groups():
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cur = db.cursor()
        cur.execute("""
            SELECT
                faculty_cluster_id AS id,
                MIN(faculty_raw) AS label,
                COUNT(*) AS users_count
            FROM users
            WHERE wants_leaderboard = 1
              AND participant_id IS NOT NULL
              AND faculty_cluster_id IS NOT NULL
            GROUP BY faculty_cluster_id
            ORDER BY label
        """)
        return [dict(row) for row in cur.fetchall()]
    
