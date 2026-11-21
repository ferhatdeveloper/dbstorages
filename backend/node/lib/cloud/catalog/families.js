/**
 * Human-readable server-type family labels (Turkish UI).
 */
const FAMILIES = {
  cx: {
    id: 'cx',
    code: 'CX',
    familyLabel: 'CX — Uygun maliyet / genel amaç',
    descriptionTr: 'Paylaşımlı Intel vCPU. Web, staging ve hafif uygulamalar için ekonomik seçenek.',
    shortHint: 'Paylaşımlı · Intel',
  },
  cpx: {
    id: 'cpx',
    code: 'CPX',
    familyLabel: 'CPX — Daha yüksek performans',
    descriptionTr: 'Paylaşımlı AMD vCPU. Daha fazla disk ve daha yüksek performans ihtiyacı için.',
    shortHint: 'Paylaşımlı · AMD',
  },
  cax: {
    id: 'cax',
    code: 'CAX',
    familyLabel: 'CAX — ARM, fiyat/performans',
    descriptionTr: 'Ampere ARM mimarisi. Bulut-native iş yüklerinde güçlü fiyat/performans.',
    shortHint: 'ARM · Ampere',
  },
  ccx: {
    id: 'ccx',
    code: 'CCX',
    familyLabel: 'CCX — Dedicated vCPU, üretim',
    descriptionTr: 'Ayrılmış (dedicated) vCPU. Üretim, veritabanı ve tutarlı performans gereken iş yükleri.',
    shortHint: 'Dedicated vCPU',
  },
};

/** Default included traffic (TB/month) for EU cloud instances when known. */
const DEFAULT_TRAFFIC_TB = 20;

/**
 * One-line Turkish use-case hints keyed by server type name.
 */
const USE_CASE_HINTS = {
  cx23: 'Küçük web sitesi, blog veya staging',
  cx33: 'Orta ölçekli web / API sunucusu',
  cx43: 'Çoklu uygulama veya orta trafik',
  cx53: 'Yoğun web / mikroservis hostu',
  cax11: 'ARM uyumlu küçük servisler',
  cax21: 'ARM web / container iş yükleri',
  cax31: 'Ölçeklenen ARM uygulamaları',
  cax41: 'Büyük ARM cluster düğümü',
  cpx22: 'Daha hızlı diskli küçük üretim',
  cpx32: 'Orta üretim / uygulama sunucusu',
  cpx42: 'Yoğun uygulama veya CI worker',
  cpx52: 'Yüksek trafikli uygulama katmanı',
  cpx62: 'Büyük paylaşımlı üretim düğümü',
  ccx13: 'Küçük DB / kritik mikroservis',
  ccx23: 'Orta veritabanı veya üretim API',
  ccx33: 'Yüksek yüklü üretim servisleri',
  ccx43: 'Büyük DB / mesaj kuyruğu',
  ccx53: 'Kurumsal üretim / analytics',
  ccx63: 'En yüksek dedicated kapasite',
};

function getFamilyMeta(familyId) {
  const key = String(familyId || '').toLowerCase();
  return FAMILIES[key] || null;
}

function attachFamilyFields(server) {
  const meta = getFamilyMeta(server.family);
  const name = String(server.name || '').toLowerCase();
  return {
    familyLabel: meta?.familyLabel || (server.family || '').toUpperCase() || null,
    descriptionTr:
      server.descriptionTr ||
      meta?.descriptionTr ||
      null,
    useCaseHint: server.useCaseHint || USE_CASE_HINTS[name] || null,
    trafficTb: server.trafficTb != null ? server.trafficTb : DEFAULT_TRAFFIC_TB,
  };
}

module.exports = {
  FAMILIES,
  DEFAULT_TRAFFIC_TB,
  USE_CASE_HINTS,
  getFamilyMeta,
  attachFamilyFields,
};
