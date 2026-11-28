/**
 * Ready-made Linux app stacks installed via cloud-init after provision.
 * Keep scripts idempotent and non-interactive.
 */

const TEMPLATES = [
  {
    id: 'none',
    name: 'Boş sunucu',
    description: 'Yalnızca işletim sistemi — uygulama yok',
    osFamily: 'linux',
    icon: 'server',
    ports: [],
  },
  {
    id: 'postgres-postgrest',
    name: 'PostgreSQL + PostgREST',
    description: 'Docker Compose ile Database + REST API (port 5432 / 3000)',
    osFamily: 'linux',
    icon: 'database',
    ports: [5432, 3000],
  },
  {
    id: 'dokploy',
    name: 'Dokploy',
    description: 'Self-hosted PaaS / deploy paneli (Docker zorunlu)',
    osFamily: 'linux',
    icon: 'boxes',
    ports: [3000, 80, 443],
  },
  {
    id: 'wireguard',
    name: 'WireGuard VPN',
    description: 'wg0 sunucu + istemci örnek konfig (UDP 51820)',
    osFamily: 'linux',
    icon: 'shield',
    ports: [51820],
  },
  {
    id: 'docker',
    name: 'Docker CE',
    description: 'Docker Engine + Compose eklentisi',
    osFamily: 'linux',
    icon: 'container',
    ports: [],
  },
];

function listAppTemplates({ osFamily } = {}) {
  const fam = String(osFamily || '').toLowerCase();
  if (!fam || fam === 'linux') {
    return TEMPLATES.filter((t) => t.osFamily === 'linux');
  }
  // Windows: only empty for now (ISO install path)
  return [
    {
      id: 'none',
      name: 'Windows Server (ISO)',
      description: 'Kendi lisansınız + ISO kurulum (VirtIO önerilir)',
      osFamily: 'windows',
      icon: 'monitor',
      ports: [3389],
    },
  ];
}

function cloudInitFor(templateId, { serverName } = {}) {
  const id = String(templateId || 'none');
  if (id === 'none' || !id) return null;

  const hostname = String(serverName || 'cloud-server')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 48);

  if (id === 'docker') {
    return `#cloud-config
hostname: ${hostname}
package_update: true
packages: [ca-certificates, curl, gnupg]
runcmd:
  - |
    set -eux
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
`;
  }

  if (id === 'postgres-postgrest') {
    return `#cloud-config
hostname: ${hostname}
package_update: true
packages: [ca-certificates, curl, gnupg]
write_files:
  - path: /opt/dbstorages/postgres-postgrest/docker-compose.yml
    permissions: "0644"
    content: |
      services:
        db:
          image: postgres:16-alpine
          restart: unless-stopped
          environment:
            POSTGRES_PASSWORD: change-me-now
            POSTGRES_DB: app
          ports:
            - "5432:5432"
          volumes:
            - pgdata:/var/lib/postgresql/data
        rest:
          image: postgrest/postgrest:v12.2.3
          restart: unless-stopped
          depends_on: [db]
          environment:
            PGRST_DB_URI: postgres://postgres:change-me-now@db:5432/app
            PGRST_DB_SCHEMA: public
            PGRST_DB_ANON_ROLE: postgres
            PGRST_SERVER_PORT: 3000
          ports:
            - "3000:3000"
      volumes:
        pgdata:
runcmd:
  - |
    set -eux
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
    cd /opt/dbstorages/postgres-postgrest && docker compose up -d
`;
  }

  if (id === 'dokploy') {
    return `#cloud-config
hostname: ${hostname}
package_update: true
packages: [ca-certificates, curl, gnupg]
runcmd:
  - |
    set -eux
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
    curl -sSL https://dokploy.com/install.sh | sh
`;
  }

  if (id === 'wireguard') {
    return `#cloud-config
hostname: ${hostname}
package_update: true
packages: [wireguard, qrencode, iptables]
write_files:
  - path: /etc/sysctl.d/99-wireguard.conf
    content: |
      net.ipv4.ip_forward=1
  - path: /opt/dbstorages/wireguard/bootstrap.sh
    permissions: "0755"
    content: |
      #!/bin/bash
      set -eux
      sysctl --system
      umask 077
      mkdir -p /etc/wireguard
      if [ ! -f /etc/wireguard/server_private.key ]; then
        wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
      fi
      PRIV=$(cat /etc/wireguard/server_private.key)
      IFACE=$(ip -4 route show default | awk '{print $5; exit}')
      cat > /etc/wireguard/wg0.conf <<EOF
      [Interface]
      Address = 10.66.66.1/24
      ListenPort = 51820
      PrivateKey = $PRIV
      PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o $IFACE -j MASQUERADE
      PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o $IFACE -j MASQUERADE
      EOF
      systemctl enable --now wg-quick@wg0
runcmd:
  - [ bash, /opt/dbstorages/wireguard/bootstrap.sh ]
`;
  }

  return null;
}

/**
 * Hostinger post-install scripts are plain shell (max 48KB), not cloud-init.
 */
function shellScriptFor(templateId, { serverName } = {}) {
  const id = String(templateId || 'none');
  if (id === 'none' || !id) return null;

  const hostname = String(serverName || 'cloud-server')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 48);

  if (id === 'docker') {
    return `#!/bin/bash
set -eux
hostnamectl set-hostname ${hostname} || true
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
`;
  }

  if (id === 'postgres-postgrest') {
    return `#!/bin/bash
set -eux
hostnamectl set-hostname ${hostname} || true
install -m 0755 -d /etc/apt/keyrings /opt/dbstorages/postgres-postgrest
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
cat > /opt/dbstorages/postgres-postgrest/docker-compose.yml <<'YAML'
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: change-me-now
      POSTGRES_DB: app
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
  rest:
    image: postgrest/postgrest:v12.2.3
    restart: unless-stopped
    depends_on: [db]
    environment:
      PGRST_DB_URI: postgres://postgres:change-me-now@db:5432/app
      PGRST_DB_SCHEMA: public
      PGRST_DB_ANON_ROLE: postgres
      PGRST_SERVER_PORT: 3000
    ports:
      - "3000:3000"
volumes:
  pgdata:
YAML
cd /opt/dbstorages/postgres-postgrest && docker compose up -d
`;
  }

  if (id === 'dokploy') {
    return `#!/bin/bash
set -eux
hostnamectl set-hostname ${hostname} || true
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
curl -sSL https://dokploy.com/install.sh | sh
`;
  }

  if (id === 'wireguard') {
    return `#!/bin/bash
set -eux
hostnamectl set-hostname ${hostname} || true
apt-get update -y
apt-get install -y wireguard qrencode iptables
cat > /etc/sysctl.d/99-wireguard.conf <<'EOF'
net.ipv4.ip_forward=1
EOF
sysctl --system
umask 077
mkdir -p /etc/wireguard
if [ ! -f /etc/wireguard/server_private.key ]; then
  wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
fi
PRIV=$(cat /etc/wireguard/server_private.key)
IFACE=$(ip -4 route show default | awk '{print $5; exit}')
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.66.66.1/24
ListenPort = 51820
PrivateKey = $PRIV
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o $IFACE -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o $IFACE -j MASQUERADE
EOF
systemctl enable --now wg-quick@wg0
`;
  }

  return null;
}

module.exports = {
  TEMPLATES,
  listAppTemplates,
  cloudInitFor,
  shellScriptFor,
};
