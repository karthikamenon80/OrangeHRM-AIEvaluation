# Local OrangeHRM (Docker)

Runs the official `orangehrm/orangehrm` image against a MariaDB container, per
OrangeHRM's own install guide.

## Start

```
docker compose up -d
```

## First-run setup (one time)

The `orangehrm/orangehrm` image does not accept environment variables for
database configuration — it ships the standard OrangeHRM web installer.
After the containers are up:

1. Open `http://localhost:8080`
2. Follow the installer wizard. When it asks for the database connection, use:
   - Host: `db` (the compose service name)
   - Port: `3306`
   - Root password: value of `DB_ROOT_PASSWORD` (defaults to `orangehrm_root_pw`)
   - It will create its own application DB/user during setup
3. Create the initial Admin user when prompted.
4. Log in at `http://localhost:8080/web/index.php/auth/login`.

## Notes for CI (GitHub Actions)

GitHub Actions Ubuntu runners have Docker and Compose preinstalled, so this
same file can be reused as a `docker compose up -d` step ahead of the
Playwright test job. Since the installer is interactive on first boot, CI
usage will need either a pre-seeded DB volume/snapshot or a scripted install
(headless install via OrangeHRM's CLI installer) — tracked as a follow-up,
not required for Day 1.

## Why exploration used the public demo instead

Docker was not available on the local dev machine for this iteration, so the
spec-writing in `openspec/changes/` was done against OrangeHRM's official
public demo (`opensource-demo.orangehrmlive.com`), which runs the same
OrangeHRM Community application. This compose file is the documented local/CI
setup path; it was not exercised for the Day 1 spec-writing itself.
