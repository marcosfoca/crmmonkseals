-- ============================================================
-- CRM MonkSeals — Schema Supabase
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  apellidos     TEXT,
  role          INT  NOT NULL DEFAULT 1,
  -- 1=Captador 2=Formador 3=JefeEquipo 4=Director 5=Gerente 6=Supergerente 99=Admin
  topf2f_user             TEXT,
  topf2f_pass             TEXT,     -- base64-encoded, NOT plaintext
  topf2f_captador_nombre  TEXT,     -- name as shown in topf2f team production (for non-root users)
  parent_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  es_raiz       BOOLEAN NOT NULL DEFAULT false,  -- root users see all socios regardless of role
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SOCIOS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS socios (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  num_formulario          TEXT UNIQUE,
  captador_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  ong                     TEXT,           -- CRUZ_ROJA | PLAN
  -- Personal
  nombre                  TEXT,
  apellido1               TEXT,
  apellido2               TEXT,
  nif                     TEXT,
  tipo_documento          TEXT,           -- DNI | NIE | PASAPORTE
  fecha_nacimiento        DATE,
  edad                    INT,
  sexo                    TEXT,           -- Hombre | Mujer
  tratamiento             TEXT,
  -- Contacto
  tlf1                    TEXT,
  tlf2                    TEXT,
  movil1                  TEXT,
  movil2                  TEXT,
  email                   TEXT,
  -- Dirección
  tipovia                 TEXT,
  dirvia                  TEXT,
  numvia                  TEXT,
  portalvia               TEXT,
  pisovia                 TEXT,
  letravia                TEXT,
  cp                      TEXT,
  municipio               TEXT,
  provincia               TEXT,
  -- Bancario
  iban                    TEXT,           -- almacenado parcialmente, sin datos completos
  -- Contrato
  cuota                   NUMERIC(8,2),
  periodicidad            TEXT,
  tarifa                  TEXT,
  fecha_firma             DATE,
  fecha_entrega           DATE,
  fecha_alta              DATE,
  fecha_okko              DATE,
  otra_fecha_cobro        DATE,
  tipo_socio              TEXT,           -- SOCIO | AUMENTO DE CUOTA
  canal                   TEXT,           -- F2F | D2D | ...
  causa                   TEXT,
  idioma                  TEXT,
  -- Estado
  estado                  TEXT,
  llamada                 BOOLEAN DEFAULT false,
  num_intentos_rellamada  INT DEFAULT 0,
  pdf_contrato            BOOLEAN DEFAULT false,
  -- Notas
  comentarios_captador    TEXT,
  comentarios_call        TEXT,
  -- Meta
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync               TIMESTAMPTZ
);

-- ── ÍNDICES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_socios_captador  ON socios(captador_id);
CREATE INDEX IF NOT EXISTS idx_socios_estado    ON socios(estado);
CREATE INDEX IF NOT EXISTS idx_socios_fecha     ON socios(fecha_alta);
CREATE INDEX IF NOT EXISTS idx_socios_ong       ON socios(ong);
CREATE INDEX IF NOT EXISTS idx_socios_nif       ON socios(nif);
CREATE INDEX IF NOT EXISTS idx_users_parent     ON users(parent_id);
CREATE INDEX IF NOT EXISTS idx_users_role       ON users(role);

-- ── RLS (Row Level Security) ─────────────────────────────────
-- Desactivada — la lógica de visibilidad la gestiona el backend
ALTER TABLE socios DISABLE ROW LEVEL SECURITY;
ALTER TABLE users  DISABLE ROW LEVEL SECURITY;

-- ── ADMIN POR DEFECTO ────────────────────────────────────────
-- Cambia la contraseña desde el panel Admin después del primer login
-- Password por defecto: Admin1234!  (bcrypt hash generado con 12 rounds)
INSERT INTO users (username, password_hash, nombre, apellidos, role, activo)
VALUES (
  'admin',
  '$2a$12$LHqpMnuBu7vQsmfXz7PgS.1LtdPGJIqVPbwKIMWMj4UgUhGJJjvWi',
  'Marcos',
  'Fortis Carretero',
  99,
  true
)
ON CONFLICT (username) DO NOTHING;
