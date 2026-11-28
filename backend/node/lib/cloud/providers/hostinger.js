/**
 * Hostinger VPS API driver.
 * REST: https://developers.hostinger.com — /api/vps/v1, /api/billing/v1
 * Only this module may call developers.hostinger.com for cloud VPS.
 */
const axios = require('axios');
const { CloudProvider } = require('../providerInterface');
const { withRetry, cloudError } = require('../errors');

const DEFAULT_BASE = 'https://developers.hostinger.com';

const NATIVE_APP_TEMPLATE_MATCHERS = {
  dokploy: [/dokploy/i],
  docker: [/^ubuntu .+ with docker$/i, /with docker$/i],
};

function mbToGb(mb) {
  const n = Number(mb);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 1024) * 100) / 100;
}

function centsToMajor(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  return Math.round(n) / 100;
}

function safeHostname(name) {
  return String(name || 'cloud-server')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cloud-server';
}

class HostingerProvider extends CloudProvider {
  /**
   * @param {{ apiToken?: string, baseUrl?: string, client?: object }} opts
   */
  constructor(opts = {}) {
    super();
    this.apiToken =
      opts.apiToken || process.env.HOSTINGER_API_TOKEN || '';
    this.baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    this._axios =
      opts.client ||
      axios.create({
        baseURL: this.baseUrl,
        timeout: Number(process.env.CLOUD_HTTP_TIMEOUT_MS || 45000),
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
  }

  async _request(method, path, data, params) {
    if (!this.apiToken) {
      throw cloudError(
        503,
        'Cloud provider API token not configured',
        'provider_unconfigured'
      );
    }
    return withRetry(async () => {
      try {
        const res = await this._axios.request({ method, url: path, data, params });
        return res.data;
      } catch (err) {
        const status = err.response?.status || 502;
        const body = err.response?.data;
        const msg =
          body?.message ||
          body?.error?.message ||
          (Array.isArray(body?.errors) && body.errors[0]?.message) ||
          err.message ||
          'Provider API error';
        const wrapped = cloudError(status, msg, 'provider_api');
        wrapped.response = { status };
        throw wrapped;
      }
    });
  }

  _mapServer(vm) {
    if (!vm) return null;
    const ipv4 =
      (Array.isArray(vm.ipv4) && vm.ipv4[0]?.address) ||
      vm.ipv4?.address ||
      null;
    const ipv6 =
      (Array.isArray(vm.ipv6) && vm.ipv6[0]?.address) ||
      vm.ipv6?.address ||
      null;
    return {
      externalId: String(vm.id),
      name: vm.hostname || vm.name || String(vm.id),
      status: String(vm.state || 'unknown').toLowerCase(),
      serverType: vm.plan || null,
      image: vm.template?.name || (vm.template?.id != null ? String(vm.template.id) : null),
      location: vm.data_center_id != null ? String(vm.data_center_id) : null,
      ipv4,
      ipv6,
      labels: {
        subscription_id: vm.subscription_id || '',
        data_center_id: vm.data_center_id != null ? String(vm.data_center_id) : '',
      },
      raw: vm,
    };
  }

  async listVirtualMachines() {
    const data = await this._request('GET', '/api/vps/v1/virtual-machines');
    const list = Array.isArray(data) ? data : data?.data || [];
    return list.map((vm) => this._mapServer(vm)).filter(Boolean);
  }

  async getServer(externalId) {
    const data = await this._request(
      'GET',
      `/api/vps/v1/virtual-machines/${externalId}`
    );
    return this._mapServer(data?.data || data);
  }

  /**
   * Purchase + setup a new VPS (charges Hostinger account).
   * spec.serverType = catalog price item id (e.g. hostingerwebtr-vps-kvm1-try-1m)
   * spec.image = template id or hostinger-tpl-{id}
   * spec.location = data center id or name (e.g. dus)
   */
  async createServer(spec) {
    const templates = await this._listTemplatesRaw();
    const locations = await this.listLocations();
    let templateId = this._parseTemplateId(spec.image);
    let skipPostInstall = false;

    const appId = String(spec.appTemplate || spec.labels?.app_template || '').toLowerCase();
    if (appId && NATIVE_APP_TEMPLATE_MATCHERS[appId]) {
      const native = this._findNativeTemplate(templates, appId);
      if (native) {
        templateId = Number(native.id);
        skipPostInstall = true;
      }
    }
    if (!templateId) {
      const ubuntu =
        templates.find((t) => /ubuntu 24\.04 lts/i.test(t.name || '')) ||
        templates.find((t) => /ubuntu 22\.04/i.test(t.name || '')) ||
        templates[0];
      if (!ubuntu) {
        throw cloudError(400, 'No Hostinger OS template available', 'validation');
      }
      templateId = Number(ubuntu.id);
    }

    const dataCenterId = this._resolveDataCenterId(spec.location, locations);
    if (!dataCenterId) {
      throw cloudError(400, 'Hostinger data center (location) required', 'validation');
    }
    if (!spec.serverType) {
      throw cloudError(400, 'Hostinger catalog price item_id (serverType) required', 'validation');
    }

    let postInstallId;
    if (!skipPostInstall && (spec.userData || spec.postInstallScript)) {
      const content = String(spec.postInstallScript || spec.userData || '');
      if (content.trim()) {
        const created = await this.createPostInstallScript({
          name: `dbstorages-${safeHostname(spec.name)}-${Date.now()}`,
          content: this._asShellScript(content),
        });
        postInstallId = created.id;
      }
    }

    const setup = {
      template_id: Number(templateId),
      data_center_id: Number(dataCenterId),
      hostname: safeHostname(spec.name),
      enable_backups: Boolean(spec.enableBackups),
      install_monarx: false,
    };
    if (Array.isArray(spec.sshKeys) && spec.sshKeys.length) {
      // Prefer raw OpenSSH public key material when available
      setup.ssh_keys = spec.sshKeys;
    }
    if (postInstallId) {
      setup.post_install_script_id = Number(postInstallId);
    }

    const data = await this._request('POST', '/api/vps/v1/virtual-machines', {
      item_id: String(spec.serverType),
      setup,
      ...(spec.paymentMethodId
        ? { payment_method_id: Number(spec.paymentMethodId) }
        : {}),
    });

    const candidate =
      data?.data ||
      data?.virtual_machine ||
      data?.virtualMachine ||
      (data?.id != null ? data : null);
    let mapped = this._mapServer(candidate);
    if (!mapped?.externalId) {
      mapped = await this._findVmByHostname(setup.hostname);
    }
    if (!mapped?.externalId) {
      // 202 Accepted / async payment — return pending placeholder
      return {
        server: {
          externalId: `pending-${setup.hostname}`,
          name: setup.hostname,
          status: 'pending',
          serverType: spec.serverType,
          image: String(templateId),
          location: String(dataCenterId),
          ipv4: null,
          ipv6: null,
          labels: { async_purchase: '1' },
        },
        action: { id: 'purchase', status: 'running' },
        rootPassword: null,
      };
    }
    return {
      server: mapped,
      action: { id: 'purchase', status: 'success' },
      rootPassword: data?.password || data?.root_password || null,
    };
  }

  async _findVmByHostname(hostname, attempts = 4) {
    const want = String(hostname || '').toLowerCase();
    for (let i = 0; i < attempts; i += 1) {
      const list = await this.listVirtualMachines();
      const hit = list.find((s) => String(s.name || '').toLowerCase() === want);
      if (hit) return hit;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    return null;
  }

  _parseTemplateId(image) {
    if (image == null || image === '') return null;
    const s = String(image);
    const m = s.match(/^hostinger-tpl-(\d+)$/i);
    if (m) return Number(m[1]);
    if (/^\d+$/.test(s)) return Number(s);
    return null;
  }

  _findNativeTemplate(templates, appId) {
    const matchers = NATIVE_APP_TEMPLATE_MATCHERS[appId] || [];
    for (const re of matchers) {
      const hit = templates.find((t) => re.test(String(t.name || '')));
      if (hit) return hit;
    }
    return null;
  }

  _resolveDataCenterId(location, locations) {
    if (location == null || location === '') return null;
    const s = String(location);
    if (/^\d+$/.test(s)) return Number(s);
    const hit = (locations || []).find(
      (l) =>
        String(l.name || '').toLowerCase() === s.toLowerCase() ||
        String(l.id) === s
    );
    return hit ? Number(hit.id) : null;
  }

  _asShellScript(content) {
    const c = String(content || '');
    if (c.startsWith('#!') || !c.includes('#cloud-config')) return c;
    // Best-effort: wrap cloud-config is not valid as post-install — callers should pass shell.
    return `#!/bin/bash\nset -eux\necho "cloud-config not supported on Hostinger post-install; use shellScriptFor" >&2\nexit 1\n`;
  }

  async createPostInstallScript({ name, content }) {
    const data = await this._request('POST', '/api/vps/v1/post-install-scripts', {
      name,
      content,
    });
    const row = data?.data || data;
    return { id: Number(row.id), name: row.name };
  }

  async deleteServer(externalId) {
    // Hostinger has no hard VM destroy API — stop compute and disable auto-renew.
    const id = String(externalId);
    if (id.startsWith('pending-')) return { ok: true, note: 'async_purchase' };
    try {
      await this.powerOff(id);
    } catch {
      /* ignore */
    }
    try {
      const vm = await this.getServer(id);
      const sub = vm?.labels?.subscription_id || vm?.raw?.subscription_id;
      if (sub) {
        await this._request(
          'DELETE',
          `/api/billing/v1/subscriptions/${encodeURIComponent(sub)}/auto-renewal/enable`
        );
      }
    } catch {
      /* best effort — cancel remaining term in hPanel if needed */
    }
    return {
      ok: true,
      note: 'stopped_and_auto_renew_disabled',
    };
  }

  async powerOn(externalId) {
    await this._request('POST', `/api/vps/v1/virtual-machines/${externalId}/start`);
    return { action: { id: 'start', status: 'success' } };
  }

  async powerOff(externalId) {
    await this._request('POST', `/api/vps/v1/virtual-machines/${externalId}/stop`);
    return { action: { id: 'stop', status: 'success' } };
  }

  async reboot(externalId) {
    await this._request('POST', `/api/vps/v1/virtual-machines/${externalId}/restart`);
    return { action: { id: 'restart', status: 'success' } };
  }

  async reset(externalId) {
    return this.reboot(externalId);
  }

  async rebuild(externalId, image) {
    const templateId = this._parseTemplateId(image);
    if (!templateId) {
      throw cloudError(400, 'Hostinger rebuild requires template id image', 'validation');
    }
    await this._request('POST', `/api/vps/v1/virtual-machines/${externalId}/recreate`, {
      template_id: Number(templateId),
    });
    return { action: { id: 'recreate', status: 'running' } };
  }

  async renameServer(externalId, name) {
    await this._request(
      'PUT',
      `/api/vps/v1/virtual-machines/${externalId}/hostname`,
      { hostname: safeHostname(name) }
    );
    return { action: { id: 'hostname', status: 'success' } };
  }

  async requestConsole(_externalId) {
    throw cloudError(
      501,
      'Hostinger web console is available in hPanel (no API console URL yet)',
      'coming_soon'
    );
  }

  async _listTemplatesRaw() {
    const data = await this._request('GET', '/api/vps/v1/templates');
    return Array.isArray(data) ? data : data?.data || [];
  }

  async listImages() {
    const templates = await this._listTemplatesRaw();
    // Prefer plain OS + key app stacks; skip panel bloat for wizard clarity.
    const preferred = templates.filter((t) => {
      const n = String(t.name || '').toLowerCase();
      if (/windows/i.test(n)) return true;
      if (/^ubuntu \d/.test(n) && !/with /.test(n)) return true;
      if (/^debian \d/.test(n) && !/with /.test(n)) return true;
      if (/almalinux|rocky|centos/i.test(n) && !/with /.test(n)) return true;
      if (/dokploy|wireguard|postgres|docker/i.test(n)) return true;
      return false;
    });
    const list = preferred.length ? preferred : templates;
    return list.map((t) => {
      const name = String(t.name || '');
      const isWin = /windows/i.test(name);
      return {
        id: String(t.id),
        name: `hostinger-tpl-${t.id}`,
        description: name,
        osFlavor: isWin ? 'windows' : 'linux',
        osFamily: isWin ? 'windows' : 'linux',
        architecture: 'x86',
        installMethod: 'template',
        templateId: String(t.id),
      };
    });
  }

  async listLocations() {
    const data = await this._request('GET', '/api/vps/v1/data-centers');
    const list = Array.isArray(data) ? data : data?.data || [];
    return list.map((d) => ({
      id: String(d.id),
      name: d.name || String(d.id),
      description: [d.city, d.location, d.continent].filter(Boolean).join(' · '),
      city: d.city || null,
      country: d.location || null,
    }));
  }

  async listServerTypes() {
    const data = await this._request('GET', '/api/billing/v1/catalog', {
      category: 'VPS',
    });
    const list = Array.isArray(data) ? data : data?.data || [];
    const kvm = list.filter((item) => /^KVM \d+$/i.test(String(item.name || '')));
    const source = kvm.length ? kvm : list.slice(0, 12);

    return source
      .map((item) => {
        const prices = Array.isArray(item.prices) ? item.prices : [];
        const monthly =
          prices.find((p) => p.period === 1 && p.period_unit === 'month' && p.currency === 'EUR') ||
          prices.find((p) => p.period === 1 && p.period_unit === 'month') ||
          prices[0];
        if (!monthly) return null;
        const meta = item.metadata || {};
        const cores = Number(meta.cpus) || null;
        const memoryGb = mbToGb(meta.memory);
        const diskGb = mbToGb(meta.disk_space);
        const providerMonthly = centsToMajor(monthly.price);
        const slug = String(item.name || item.id)
          .toLowerCase()
          .replace(/\s+/g, '');
        return {
          id: String(monthly.id),
          name: slug,
          description: item.name,
          family: 'kvm',
          cores,
          memory: memoryGb,
          memoryGb,
          disk: diskGb,
          diskGb,
          architecture: 'x86',
          cpuKind: 'shared',
          currency: monthly.currency || 'EUR',
          priceProviderMonthly: providerMonthly,
          prices: [
            {
              location: 'any',
              price_monthly: {
                net: providerMonthly != null ? String(providerMonthly) : null,
                gross: providerMonthly != null ? String(providerMonthly) : null,
              },
            },
          ],
          catalogItemId: item.id,
          priceItemId: monthly.id,
        };
      })
      .filter(Boolean);
  }

  async listSSHKeys() {
    try {
      const data = await this._request('GET', '/api/vps/v1/public-keys');
      const list = Array.isArray(data) ? data : data?.data || [];
      return list.map((k) => ({
        id: String(k.id),
        name: k.name,
        fingerprint: k.fingerprint || null,
        publicKey: k.key || k.public_key || null,
      }));
    } catch {
      return [];
    }
  }

  async createSSHKey(spec) {
    const data = await this._request('POST', '/api/vps/v1/public-keys', {
      name: spec.name,
      key: spec.publicKey,
    });
    const row = data?.data || data;
    return {
      sshKey: {
        externalId: String(row.id),
        name: row.name,
        fingerprint: row.fingerprint || null,
        publicKey: row.key || spec.publicKey,
      },
    };
  }

  async deleteSSHKey(externalId) {
    await this._request('DELETE', `/api/vps/v1/public-keys/${externalId}`);
    return { ok: true };
  }
}

module.exports = { HostingerProvider, NATIVE_APP_TEMPLATE_MATCHERS };
