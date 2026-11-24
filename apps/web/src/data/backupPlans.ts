/** Veeam Backup · QNAP NAS — S3 uyumlu yedek depolama kataloğu. */
export type BackupPlan = {
  id: string
  name: string
  capacityLabel: string
  capacityGb: number
  priceCents: number
  priceYearCents: number
  currency: 'usd'
  highlight?: boolean
  description: string
  features: string[]
}

/** Retail paketler — Veeam Backup Repository / QNAP Hybrid Backup Sync. */
export const BACKUP_PLANS: BackupPlan[] = [
  {
    id: 'backup-100gb',
    name: 'Backup 100 GB',
    capacityLabel: '100 GB',
    capacityGb: 100,
    priceCents: 249,
    priceYearCents: 2490,
    currency: 'usd',
    description: 'Tek QNAP NAS veya küçük Veeam işleri için giriş kotası.',
    features: [
      'S3 uyumlu repository',
      'Veeam Backup & Replication',
      'QNAP Hybrid Backup Sync',
      'Studio’dan erişim anahtarı',
    ],
  },
  {
    id: 'backup-1tb',
    name: 'Backup 1 TB',
    capacityLabel: '1 TB',
    capacityGb: 1024,
    priceCents: 999,
    priceYearCents: 9990,
    currency: 'usd',
    highlight: true,
    description: 'Ofis / şube NAS yedekleri ve günlük Veeam job’ları.',
    features: [
      'S3 uyumlu repository',
      'Veeam SOBR / capacity tier',
      'QNAP HBS3 cloud backup',
      'Signed URL / Studio Storage',
    ],
  },
  {
    id: 'backup-5tb',
    name: 'Backup 5 TB',
    capacityLabel: '5 TB',
    capacityGb: 5120,
    priceCents: 4499,
    priceYearCents: 44990,
    currency: 'usd',
    description: 'Çoklu NAS ve yüksek retention Veeam arşivi.',
    features: [
      'S3 uyumlu repository',
      'Çok cihaz / çok job',
      'Bucket + prefix izolasyonu',
      'Öncelikli destek kanalı',
    ],
  },
  {
    id: 'backup-10tb',
    name: 'Backup 10 TB',
    capacityLabel: '10 TB',
    capacityGb: 10240,
    priceCents: 8499,
    priceYearCents: 84990,
    currency: 'usd',
    description: 'Kurumsal Veeam panoları ve QNAP filoları.',
    features: [
      'S3 uyumlu repository',
      'Yüksek kota',
      'IAM uyumlu erişim',
      'Kurumsal onboarding',
    ],
  },
]

export const BACKUP_REGIONS = [
  {
    id: 'eu-ams',
    name: 'Amsterdam',
    code: 'eu-central',
    note: 'AB · düşük gecikme (TR / EU NAS)',
    flag: 'NL',
  },
  {
    id: 'eu-fra',
    name: 'Frankfurt',
    code: 'eu-central',
    note: 'AB · GDPR uyumlu bölge',
    flag: 'DE',
  },
  {
    id: 'eu-lon',
    name: 'London',
    code: 'eu-west',
    note: 'UK · bölgesel yedek',
    flag: 'UK',
  },
  {
    id: 'eu-par',
    name: 'Paris',
    code: 'eu-west',
    note: 'AB · Fransa',
    flag: 'FR',
  },
  {
    id: 'us-east',
    name: 'Virginia',
    code: 'us-east',
    note: 'US East · DR / ikinci kopya',
    flag: 'US',
  },
  {
    id: 'ap-tyo',
    name: 'Tokyo',
    code: 'ap-northeast',
    note: 'APAC · Asya NAS filoları',
    flag: 'JP',
  },
]

export const BACKUP_FEATURES = [
  {
    title: 'Veeam Backup',
    body: 'Object storage’ı Veeam Backup & Replication’da capacity / SOBR repository olarak bağlayın.',
  },
  {
    title: 'QNAP NAS',
    body: 'Hybrid Backup Sync (HBS3) ile QNAP cihazlarınızı S3 uyumlu endpoint’e yedekleyin.',
  },
  {
    title: 'S3 uyumlu',
    body: 'Standart S3 API — Veeam, QNAP, Synology ve çoğu yedek yazılımı doğrudan çalışır.',
  },
  {
    title: 'Öngörülebilir kota',
    body: 'Sabit GB paketleri; egress sürprizi olmadan NAS ve Veeam job’larınızı planlayın.',
  },
]
