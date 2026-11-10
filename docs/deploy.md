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

From then on the VPS holds the real copy of the games. New packs go up
from Setup's **Packs** box (pick the pack's folder; see docs/packs.md), so
`scp` is only needed for games.

### A volume for big packs

The VPS disk is 40 GB; JB2A alone is about 10 GB. Give packs their own
Hetzner Volume (Cloud console → Volumes → Create, same location as the
server, ext4, "automatic" mounting off) and mount it over the packs folder:

```sh
ssh root@<ip>
cd /opt/vtt && docker compose stop vtt
mkdir -p /mnt/new && mount /dev/disk/by-id/scsi-0HC_Volume_<id> /mnt/new
rsync -a data/packs/ /mnt/new/ && umount /mnt/new
rm -rf data/packs/* && echo '/dev/disk/by-id/scsi-0HC_Volume_<id> /opt/vtt/data/packs ext4 discard,nofail,defaults 0 0' >> /etc/fstab
mount -a && chown -R 1000:1000 /opt/vtt/data/packs
docker compose start vtt
```

The volume sits at `/opt/vtt/data/packs` itself (a symlink inside `data/`
would point outside the container). `df -h /opt/vtt/data/packs` shows its
room.

## Backups

The server keeps its own game backups in `data/backups` (every 15 minutes of
play, kept on the same disk). For a copy off the machine it also makes a
**nightly backup** to backup storage you give it in `.env`: every game folder
as a zip (pictures and all) plus the server's own files (accounts,
characters, the games list; not packs, sessions or the local backups), under
`nights/<YYYY-MM-DD>/`. The newest 30 nights are kept. Setup shows the last
copy, makes one now, and puts any game back as it was on a night (also a
game deleted since); the game as it is then is backed up locally first.

An S3 bucket (Hetzner Object Storage, Backblaze B2, Cloudflare R2, AWS):

```sh
VTT_BACKUP_S3_ENDPOINT=https://fsn1.your-objectstorage.com
VTT_BACKUP_S3_BUCKET=vtt-backups
VTT_BACKUP_S3_REGION=fsn1
VTT_BACKUP_S3_KEY=...
VTT_BACKUP_S3_SECRET=...
```

Or a folder the container can see (a mounted volume or storage box, added
as a volume in `compose.yml`): `VTT_BACKUP_DIR=/backups`. Optional:
`VTT_BACKUP_KEEP` (nights, default 30) and `VTT_BACKUP_HOUR` (UTC hour after
which the night's copy is made, default 3). After editing `.env`:
`cd /opt/vtt && docker compose up -d`. The log says
`[offsite] nightly backups to ...`; a mistake in the settings is logged and the
server runs without them. The server's own files (`server.zip`) are put back
by hand: unzip it into `/opt/vtt/data` with the server stopped.

## Looking at it

```sh
ssh deploy@<ip>
cd /opt/vtt
docker compose ps            # both running, vtt healthy
docker compose logs -f vtt   # the server's log
```
