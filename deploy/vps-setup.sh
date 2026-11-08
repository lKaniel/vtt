#!/bin/bash
# One-time setup of a fresh Ubuntu VPS for the VTT, run as root:
#   bash vps-setup.sh "ssh-ed25519 AAAA... github-deploy"
# Installs Docker, opens only SSH and the web ports, and makes the deploy
# user (uid 1000, the same as the container's node user) and /opt/vtt.
set -euo pipefail
DEPLOY_KEY="${1:?usage: vps-setup.sh '<deploy public key>'}"

apt-get update
apt-get -y upgrade
apt-get -y install docker.io docker-compose-v2 ufw unattended-upgrades
systemctl enable --now docker

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash --uid 1000 deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# The deploy key, plus root's keys so you can log in as deploy too.
{ echo "$DEPLOY_KEY"; cat /root/.ssh/authorized_keys 2>/dev/null || true; } |
  sort -u > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# Keys only, no passwords.
cat > /etc/ssh/sshd_config.d/10-vtt.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
systemctl reload ssh

install -d -o deploy -g deploy /opt/vtt /opt/vtt/data
echo "Done. Next: put /opt/vtt/.env in place (see deploy/env.example) and run the Deploy workflow."
