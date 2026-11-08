# Deploying to a VPS

The game runs on a VPS as two Docker containers: the server (the image built
from `Dockerfile`) and Caddy in front of it for HTTPS. Everything a game
writes lives in `/opt/vtt/data` on the VPS, never in the image, so a new
version keeps every game, pack, account and session.

```
/opt/vtt/
  compose.yml   Caddyfile   copied by each deploy (deploy/)
  .env                      domain and passwords (deploy/env.example), yours
  data/                     VTT_DATA: games/, packs/, plugins/, characters/, ...
    world/                  VTT_GAME, the home game (the sample world on first start)
```

## How a deploy happens

`.github/workflows/deploy.yml` runs after **Check** passes on `main`: it builds
the image, pushes it to `ghcr.io/lkaniel/vtt` (tagged with the commit and
`latest`), copies `deploy/compose.yml` and `deploy/Caddyfile` to the VPS over
SSH, pulls the image and restarts the containers. A restart drops everyone's
connection for a few seconds.

- **Hold deploys on game night:** set the repository variable `DEPLOY_HOLD` to
  `true` (Settings → Secrets and variables → Actions → Variables). Merges then
  only build in CI; set it back to `false` or run the workflow by hand.
- **Deploy by hand:** Actions → Deploy → Run workflow (deploys `main`, even
  while held).
- **Roll back:** on the VPS, `cd /opt/vtt && VTT_TAG=<older commit sha> docker compose up -d`.

## One-time setup

1. **A deploy key**, only for GitHub (no passphrase, never your own key):
   `ssh-keygen -t ed25519 -N "" -C github-deploy -f ~/vtt-deploy`
2. **The VPS** (a fresh Ubuntu, logged in with your own key as root):
   `ssh root@<ip> "bash -s -- '$(cat ~/vtt-deploy.pub)'" < deploy/vps-setup.sh`
   It installs Docker and a firewall (SSH, 80, 443 only), turns off password
   logins and makes the `deploy` user and `/opt/vtt`.
3. **The settings file:** `ssh deploy@<ip>`, then write `/opt/vtt/.env` from
   `deploy/env.example`. Without a domain, `VTT_DOMAIN=<ip with dashes>.sslip.io`
   (for example `95-217-234-49.sslip.io`) gets a real certificate too.
4. **GitHub secrets** (Settings → Secrets and variables → Actions):

   | Secret            | Value                                      |
   | ----------------- | ------------------------------------------ |
   | `VPS_HOST`        | the VPS's IP                               |
   | `VPS_USER`        | `deploy`                                   |
   | `VPS_SSH_KEY`     | the whole of `~/vtt-deploy` (private)      |
   | `VPS_KNOWN_HOSTS` | optional: the output of `ssh-keyscan <ip>` |

   With the GitHub CLI: `gh secret set VPS_SSH_KEY < ~/vtt-deploy` and
   `ssh-keyscan <ip> | gh secret set VPS_KNOWN_HOSTS`.

5. **First deploy:** Actions → Deploy → Run workflow. Then open the domain.

## Moving games and packs over

Private packs (`cursed-lands-art`, `jb2a-patreon`, ...) and games never go
into git or the image; copy them straight into `/opt/vtt/data`. Stop the
server first so it doesn't write while files arrive:

```sh
ssh deploy@<ip> "cd /opt/vtt && docker compose stop vtt"
scp -r data/packs data/games data/games.json data/characters deploy@<ip>:/opt/vtt/data/
scp -r world/. deploy@<ip>:/opt/vtt/data/world/
ssh deploy@<ip> "cd /opt/vtt && docker compose start vtt"
```

From then on the VPS holds the real copy of the games. New packs go up the
same way (`scp -r data/packs/<pack> ...`); `rsync -av` copies only what
changed where it is installed.

## Backups

The server keeps its own game backups in `data/backups`. For a copy off the
machine, turn on the provider's daily server backups (Hetzner: Backups tab),
or copy `data/` minus `packs/` to a storage box with restic.

## Looking at it

```sh
ssh deploy@<ip>
cd /opt/vtt
docker compose ps            # both running, vtt healthy
docker compose logs -f vtt   # the server's log
```
